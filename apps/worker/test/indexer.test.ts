/**
 * Indexer cursor safety, against an in-memory PGlite DB and a fake RPC.
 *
 * The property under test is the one the ledger depends on: the cursor never
 * moves past a signature whose events were not ingested. `getSignaturesForAddress`
 * only pages backwards from the tip, so a backlog deeper than the page budget
 * arrives missing its OLDEST end — and advancing to the newest of what did come
 * back would strand the rest permanently, with nothing to notice it afterwards.
 */
import { type KairosDb, createDb, dbSchema } from '@kairos/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURSOR_ID, pollOnce } from '../src/indexer.js';

let db: KairosDb;

/** Oldest-first, so `chain[0]` is the oldest signature on the fake chain. */
function makeChain(size: number): string[] {
    return Array.from({ length: size }, (_, i) => `sig-${String(i).padStart(4, '0')}`);
}

interface FakeRpcOptions {
    /** Signatures the node lists but refuses to return a transaction for. */
    missing?: Set<string>;
}

/**
 * Mimics the two RPC calls the indexer makes. `getSignaturesForAddress` is
 * newest-first with `before` (strictly older than) and `until` (exclusive
 * floor), matching the real endpoint — the paging direction is the whole point
 * of these tests, so getting it right here is what makes them mean anything.
 */
function fakeRpc(chain: string[], options: FakeRpcOptions = {}) {
    const calls = { transactions: [] as string[] };
    const rpc = {
        getSignaturesForAddress(
            _address: unknown,
            params: { limit: number; before?: string; until?: string },
        ) {
            return {
                send: async () => {
                    let list = [...chain].reverse();
                    if (params.before) list = list.slice(list.indexOf(params.before) + 1);
                    if (params.until) {
                        const index = list.indexOf(params.until);
                        if (index >= 0) list = list.slice(0, index);
                    }
                    return list
                        .slice(0, params.limit)
                        .map((signature) => ({ signature, err: null, slot: 1, blockTime: 1 }));
                },
            };
        },
        getTransaction(signature: string) {
            return {
                send: async () => {
                    calls.transactions.push(signature);
                    if (options.missing?.has(signature)) return null;
                    // A transaction with no inner instructions decodes to no
                    // events, which keeps these tests about cursor movement.
                    return { meta: { err: null, innerInstructions: [] } };
                },
            };
        },
    };
    return { rpc: rpc as never, calls };
}

async function readCursor(): Promise<string | null> {
    const rows = await db
        .select({ lastSignature: dbSchema.cursors.lastSignature })
        .from(dbSchema.cursors)
        .where(eq(dbSchema.cursors.id, CURSOR_ID))
        .limit(1);
    return rows[0]?.lastSignature ?? null;
}

async function setCursor(signature: string): Promise<void> {
    await db.insert(dbSchema.cursors).values({ id: CURSOR_ID, lastSignature: signature });
}

beforeEach(async () => {
    db = await createDb('pglite://memory', { migrate: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('pollOnce cursor safety', () => {
    it('refuses to advance past a backlog it could not page to the bottom of', async () => {
        // One page covers 1000 signatures; the gap below the cursor is 1500, so
        // the walk reaches the tip but never the cursor.
        const chain = makeChain(1600);
        await setCursor('sig-0099');
        const { rpc, calls } = fakeRpc(chain);

        const result = await pollOnce({
            db,
            rpc,
            backfillLimit: 100,
            maxPagesPerPoll: 1,
            maxSignaturesPerCycle: 5000,
            txDelayMs: 0,
        });

        expect(result.signatures).toBe(0);
        expect(result.deferred).toBeGreaterThan(0);
        // Nothing fetched, and — the part that matters — nothing skipped: the
        // cursor is exactly where it was, so the backlog is still reachable.
        expect(calls.transactions).toHaveLength(0);
        expect(await readCursor()).toBe('sig-0099');
    });

    // Deliberately generous timeout on the case below. A page holds 1000
    // signatures, so exercising multi-page paging at all needs more than that,
    // and this one writes the cursor once per signature — roughly 1500
    // sequential round trips to PGlite. That is genuinely slow rather than
    // suspicious, and leaving it on the default makes it fail whenever the
    // machine is busy: the kind of flake that teaches people to rerun a red
    // suite instead of reading it.
    it('covers every signature in a deep backlog once the pages can reach it', async () => {
        const chain = makeChain(1600);
        await setCursor('sig-0099');
        const { rpc, calls } = fakeRpc(chain);

        // Same backlog, now with enough pages to find its bottom. Work stays
        // bounded per cycle, so it takes several — but skips nothing.
        for (let cycle = 0; cycle < 20; cycle++) {
            await pollOnce({
                db,
                rpc,
                backfillLimit: 100,
                maxPagesPerPoll: 5,
                maxSignaturesPerCycle: 200,
                txDelayMs: 0,
            });
        }

        const expected = chain.slice(chain.indexOf('sig-0099') + 1);
        expect(calls.transactions).toEqual(expected);
        expect(await readCursor()).toBe(chain[chain.length - 1]);
    }, 60_000);

    it('processes oldest-first and leaves the remainder for the next cycle', async () => {
        const chain = makeChain(5);
        await setCursor('sig-0000');
        const { rpc, calls } = fakeRpc(chain);
        const opts = {
            db,
            rpc,
            backfillLimit: 100,
            maxPagesPerPoll: 5,
            maxSignaturesPerCycle: 2,
            txDelayMs: 0,
        };

        const first = await pollOnce(opts);
        expect(first.signatures).toBe(2);
        expect(first.deferred).toBe(2);
        expect(calls.transactions).toEqual(['sig-0001', 'sig-0002']);
        expect(await readCursor()).toBe('sig-0002');

        const second = await pollOnce(opts);
        expect(second.signatures).toBe(2);
        expect(second.deferred).toBe(0);
        expect(calls.transactions).toEqual(['sig-0001', 'sig-0002', 'sig-0003', 'sig-0004']);
        expect(await readCursor()).toBe('sig-0004');
    });

    it('stops at a transaction the node will not return instead of stepping over it', async () => {
        const chain = makeChain(4);
        await setCursor('sig-0000');
        const { rpc, calls } = fakeRpc(chain, { missing: new Set(['sig-0002']) });
        const opts = {
            db,
            rpc,
            backfillLimit: 100,
            maxPagesPerPoll: 5,
            maxSignaturesPerCycle: 100,
            txDelayMs: 0,
        };

        const first = await pollOnce(opts);
        // sig-0001 went through; sig-0002 came back empty and ended the cycle
        // before the cursor could move past it.
        expect(first.signatures).toBe(1);
        expect(await readCursor()).toBe('sig-0001');
        expect(calls.transactions).toEqual(['sig-0001', 'sig-0002']);

        // The next cycle retries the same signature rather than resuming after it.
        await pollOnce(opts);
        expect(calls.transactions).toEqual(['sig-0001', 'sig-0002', 'sig-0002']);
        expect(await readCursor()).toBe('sig-0001');
    });

    it('starts a fresh database from the backfill window without stalling', async () => {
        const chain = makeChain(250);
        const { rpc, calls } = fakeRpc(chain);

        const result = await pollOnce({
            db,
            rpc,
            backfillLimit: 10,
            maxPagesPerPoll: 5,
            maxSignaturesPerCycle: 100,
            txDelayMs: 0,
        });

        // No cursor means no earlier commitment, so the backfill window is the
        // starting point rather than a gap to refuse.
        expect(result.signatures).toBe(10);
        expect(calls.transactions[0]).toBe('sig-0240');
        expect(await readCursor()).toBe('sig-0249');
    });
});
