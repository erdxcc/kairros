/**
 * Cursor-based polling indexer for the Subscriptions program.
 *
 * Reliability model (polling-first, no WebSockets):
 *   - `getSignaturesForAddress(program, { until: cursor })` finds everything
 *     since the last fully processed signature: nothing is missed across
 *     restarts, and a fresh database backfills through the same code path.
 *   - Signatures are processed oldest-first; the cursor advances only after
 *     a signature is fully ingested (idempotent inserts make replays safe).
 *   - Failed transactions emit no events but still advance the cursor.
 */
import {
    type KairosDb,
    dbSchema,
    extractEventsFromTransaction,
    runLeasedLoop,
    sleep,
    withRetry,
} from '@kairos/core';
import { type Signature, address, type createSolanaRpc } from '@solana/kit';
import { SUBSCRIPTIONS_PROGRAM_ADDRESS } from '@solana/subscriptions';
import { eq, sql } from 'drizzle-orm';
import { ingestEvent } from './projections.js';

type Rpc = ReturnType<typeof createSolanaRpc>;

export interface IndexerOptions {
    db: KairosDb;
    rpc: Rpc;
    /** Max signatures fetched on the very first run (empty cursor). */
    backfillLimit: number;
    /** Max signature pages per poll when catching up a large gap. */
    maxPagesPerPoll: number;
    /** Delay between getTransaction calls, to respect RPC rate limits. */
    txDelayMs: number;
}

export const CURSOR_ID = 'subscriptions-indexer';
const PROGRAM = address(SUBSCRIPTIONS_PROGRAM_ADDRESS);
const PAGE_LIMIT = 1000;

interface SignatureEntry {
    signature: string;
    err: unknown;
    slot: bigint;
    blockTime: bigint | null;
}

async function loadCursor(db: KairosDb): Promise<string | undefined> {
    const rows = await db
        .select({ lastSignature: dbSchema.cursors.lastSignature })
        .from(dbSchema.cursors)
        .where(eq(dbSchema.cursors.id, CURSOR_ID))
        .limit(1);
    return rows[0]?.lastSignature ?? undefined;
}

async function saveCursor(db: KairosDb, signature: string): Promise<void> {
    await db
        .insert(dbSchema.cursors)
        .values({ id: CURSOR_ID, lastSignature: signature })
        .onConflictDoUpdate({
            target: dbSchema.cursors.id,
            set: { lastSignature: signature, updatedAt: sql`now()` },
        });
}

/** Collects signatures newer than the cursor, oldest-first. */
async function collectNewSignatures(
    opts: IndexerOptions,
    cursor: string | undefined,
): Promise<SignatureEntry[]> {
    const collected: SignatureEntry[] = [];
    let before: string | undefined;

    for (let page = 0; page < opts.maxPagesPerPoll; page++) {
        const limit = cursor ? PAGE_LIMIT : Math.min(opts.backfillLimit, PAGE_LIMIT);
        const batch = await withRetry(() =>
            opts.rpc
                .getSignaturesForAddress(PROGRAM, {
                    limit,
                    ...(cursor ? { until: cursor as Signature } : {}),
                    ...(before ? { before: before as Signature } : {}),
                })
                .send(),
        );
        collected.push(
            ...batch.map((entry) => ({
                signature: entry.signature as string,
                err: entry.err,
                slot: BigInt(entry.slot),
                blockTime: entry.blockTime === null ? null : BigInt(entry.blockTime),
            })),
        );
        // A short page means we reached the cursor (or the chain's history end).
        if (batch.length < limit || !cursor) break;
        before = batch[batch.length - 1]?.signature as string;
        if (page === opts.maxPagesPerPoll - 1) {
            console.warn(
                `[indexer] gap larger than ${opts.maxPagesPerPoll} pages; continuing next poll (cursor only advances after processing).`,
            );
        }
    }
    return collected.reverse(); // RPC returns newest-first; we process oldest-first
}

/** One poll cycle. Returns counts for logging/monitoring. */
export async function pollOnce(
    opts: IndexerOptions,
): Promise<{ signatures: number; events: number; skipped: number }> {
    const cursor = await loadCursor(opts.db);
    const entries = await collectNewSignatures(opts, cursor);
    let eventCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
        if (entry.err === null) {
            const tx = await withRetry(() =>
                opts.rpc
                    .getTransaction(entry.signature as Signature, {
                        encoding: 'jsonParsed',
                        maxSupportedTransactionVersion: 0,
                    })
                    .send(),
            );
            if (tx) {
                const { events, skipped } = extractEventsFromTransaction(tx, SUBSCRIPTIONS_PROGRAM_ADDRESS);
                // Undecodable events are a gap, not a reason to stop: the
                // cursor still advances below. Loud, per occurrence, because a
                // silent gap in a billing ledger is worse than a noisy log.
                for (const skip of skipped) {
                    skippedCount++;
                    console.error(
                        `[indexer] SKIPPED ${skip.unknownKind ? 'unknown event kind' : 'undecodable event'}` +
                            ` ${skip.eventKind ?? '?'} at ${entry.signature}[${skip.outerIxIndex}.${skip.innerIxIndex}]: ${skip.reason}`,
                    );
                }
                for (const { outerIxIndex, innerIxIndex, event } of events) {
                    const fresh = await ingestEvent(
                        opts.db,
                        opts.rpc,
                        { signature: entry.signature, slot: entry.slot, blockTime: entry.blockTime },
                        { outerIxIndex, innerIxIndex },
                        event,
                    );
                    if (fresh) {
                        eventCount++;
                        console.log(`[indexer] ${event.kind} @ ${entry.signature.slice(0, 16)}…`);
                    }
                }
            } else {
                console.warn(`[indexer] transaction ${entry.signature} not found on RPC; skipping`);
            }
            await sleep(opts.txDelayMs);
        }
        // Cursor advances per signature so a kill mid-batch resumes precisely.
        await saveCursor(opts.db, entry.signature);
    }

    return { signatures: entries.length, events: eventCount, skipped: skippedCount };
}

export interface RunOptions extends IndexerOptions {
    pollIntervalMs: number;
    leaseTtlMs: number;
    stopSignal: { stopped: boolean };
}

/** Runs the poll loop, while this process holds the indexer lease. */
export async function runIndexer(opts: RunOptions): Promise<void> {
    console.log(`[indexer] watching program ${PROGRAM} (poll every ${opts.pollIntervalMs / 1000}s)`);
    await runLeasedLoop({
        db: opts.db,
        name: 'indexer',
        label: 'indexer',
        ttlMs: opts.leaseTtlMs,
        intervalMs: opts.pollIntervalMs,
        stopSignal: opts.stopSignal,
        tick: async () => {
            const { signatures, events, skipped } = await pollOnce(opts);
            if (signatures > 0) {
                console.log(
                    `[indexer] processed ${signatures} signatures, ${events} new events${skipped > 0 ? `, ${skipped} SKIPPED (see errors above)` : ''}`,
                );
            }
        },
    });
}
