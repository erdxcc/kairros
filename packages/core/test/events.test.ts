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
import { getBase58Encoder } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { decodeEventData, isEventInstructionData } from '../src/events.js';
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
    if (!someEvent) throw new Error('fixtures are empty — run scripts/record-fixtures.ts');
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
    });
});
