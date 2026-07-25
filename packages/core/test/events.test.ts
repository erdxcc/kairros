/**
 * Golden-fixture tests for the self-CPI event decoders.
 *
 * Fixtures are raw instruction bytes recorded from real devnet transactions
 * (see scripts/record-fixtures.ts). If the program's wire format ever changes
 * upstream, these tests fail loudly instead of silently mis-indexing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBase58Decoder, getBase58Encoder } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import {
    UnknownEventKindError,
    decodeEventData,
    extractEventsFromTransaction,
    isEventInstructionData,
} from '../src/events.js';
import { EVENT_IX_TAG_LE } from '../src/program.js';

interface FixtureEvent {
    outerIxIndex: number;
    innerIxIndex: number;
    dataBase58: string;
    golden: Record<string, unknown>;
}

interface FixtureTransaction {
    signature: string;
    slot: string;
    blockTime: number | null;
    events: FixtureEvent[];
}

const fixtures: FixtureTransaction[] = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'events.json'), 'utf8'),
);

const toBytes = (base58: string) => getBase58Encoder().encode(base58) as Uint8Array;

const jsonify = (value: unknown) =>
    JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

describe('event decoders (golden fixtures from devnet)', () => {
    it('fixtures cover all six event kinds', () => {
        const kinds = new Set(fixtures.flatMap((tx) => tx.events.map((e) => e.golden.kind)));
        expect([...kinds].sort()).toEqual([
            'fixedTransfer',
            'recurringTransfer',
            'subscriptionCancelled',
            'subscriptionCreated',
            'subscriptionResumed',
            'subscriptionTransfer',
        ]);
    });

    for (const tx of fixtures) {
        for (const event of tx.events) {
            it(`${event.golden.kind} @ ${tx.signature.slice(0, 12)}…[${event.outerIxIndex}.${event.innerIxIndex}]`, () => {
                const decoded = decodeEventData(toBytes(event.dataBase58));
                expect(decoded).toBeDefined();
                expect(jsonify(decoded)).toEqual(event.golden);
            });
        }
    }
});

describe('decoder hardening', () => {
    const someEvent = fixtures[0]?.events[0];
    if (!someEvent) throw new Error('fixtures are empty, run scripts/record-fixtures.ts');
    const validBytes = toBytes(someEvent.dataBase58);

    it('rejects data without the event tag', () => {
        expect(isEventInstructionData(new Uint8Array([1, 2, 3]))).toBe(false);
        expect(decodeEventData(new Uint8Array(32))).toBeUndefined();
    });

    it('throws on a truncated payload (layout-change tripwire)', () => {
        expect(() => decodeEventData(validBytes.subarray(0, validBytes.byteLength - 4))).toThrow(
            /length mismatch/,
        );
    });

    it('throws on an unknown event kind', () => {
        const unknownKind = new Uint8Array([...EVENT_IX_TAG_LE, 99, 0, 0, 0]);
        expect(() => decodeEventData(unknownKind)).toThrow(/Unknown event kind/);
        expect(() => decodeEventData(unknownKind)).toThrow(UnknownEventKindError);
    });
});

/**
 * The ingestion boundary must not throw. The indexer advances its cursor after
 * each signature, so an exception here stops the cursor on the offending
 * transaction and re-fails on it every cycle, permanently: no projections, no
 * billing, no webhooks. A decode failure has to degrade to a reported gap.
 */
describe('extraction never throws at the ingestion boundary', () => {
    const PROGRAM = 'De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44';
    const decoder = getBase58Decoder();

    const txWith = (data: Uint8Array) => ({
        meta: {
            err: null,
            innerInstructions: [
                { index: 0, instructions: [{ programId: PROGRAM, data: decoder.decode(data) }] },
            ],
        },
    });

    it('reports an unknown event kind instead of throwing', () => {
        const unknownKind = new Uint8Array([...EVENT_IX_TAG_LE, 99, 0, 0, 0]);
        const result = extractEventsFromTransaction(txWith(unknownKind), PROGRAM);
        expect(result.events).toEqual([]);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0]?.unknownKind).toBe(true);
        expect(result.skipped[0]?.eventKind).toBe(99);
    });

    it('reports a truncated payload instead of throwing', () => {
        const someEvent = fixtures[0]?.events[0];
        if (!someEvent) throw new Error('fixtures are empty');
        const truncated = toBytes(someEvent.dataBase58).slice(0, -4);
        const result = extractEventsFromTransaction(txWith(truncated), PROGRAM);
        expect(result.events).toEqual([]);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0]?.unknownKind).toBe(false);
        expect(result.skipped[0]?.reason).toMatch(/length mismatch/);
    });

    it('still returns the good events alongside a bad one', () => {
        const someEvent = fixtures[0]?.events[0];
        if (!someEvent) throw new Error('fixtures are empty');
        const good = someEvent.dataBase58;
        const bad = decoder.decode(new Uint8Array([...EVENT_IX_TAG_LE, 99, 0, 0, 0]));
        const tx = {
            meta: {
                err: null,
                innerInstructions: [
                    {
                        index: 0,
                        instructions: [
                            { programId: PROGRAM, data: bad },
                            { programId: PROGRAM, data: good },
                        ],
                    },
                ],
            },
        };
        const result = extractEventsFromTransaction(tx, PROGRAM);
        expect(result.events).toHaveLength(1);
        expect(result.events[0]?.innerIxIndex).toBe(1);
        expect(result.skipped).toHaveLength(1);
    });
});
