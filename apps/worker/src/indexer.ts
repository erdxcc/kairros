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
    /**
     * How far the signature walk may page while *locating* the bottom of a gap.
     *
     * `getSignaturesForAddress` only pages backwards from the tip, so finding
     * the oldest unprocessed signature means paging down until the cursor comes
     * into view. These are cheap metadata calls; the expensive per-transaction
     * work is bounded separately by `maxSignaturesPerCycle`.
     */
    maxPagesPerPoll: number;
    /**
     * Max signatures actually processed per cycle.
     *
     * Bounds one tick's wall time, which matters because the lease is renewed
     * *between* ticks, not during one: a cycle that outruns its own lease hands
     * the loop to a standby while it is still working. Keep
     * `maxSignaturesPerCycle * txDelayMs` comfortably under INDEXER_LEASE_TTL_MS.
     */
    maxSignaturesPerCycle: number;
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

interface CollectedSignatures {
    /** Oldest-first, ready to process in order. */
    entries: SignatureEntry[];
    /**
     * Whether the walk got all the way down to the cursor.
     *
     * False means the pages ran out first, so the *oldest* signatures in the
     * gap were never fetched even though the newest ones were. That distinction
     * decides whether the cursor may move at all: see `pollOnce`.
     */
    reachedCursor: boolean;
}

/** Collects signatures newer than the cursor, oldest-first. */
async function collectNewSignatures(
    opts: IndexerOptions,
    cursor: string | undefined,
): Promise<CollectedSignatures> {
    const collected: SignatureEntry[] = [];
    let before: string | undefined;
    let reachedCursor = false;

    for (let page = 0; page < opts.maxPagesPerPoll; page++) {
        const limit = cursor ? PAGE_LIMIT : Math.min(opts.backfillLimit, PAGE_LIMIT);
        const batch = await withRetry(
            () =>
                opts.rpc
                    .getSignaturesForAddress(PROGRAM, {
                        limit,
                        ...(cursor ? { until: cursor as Signature } : {}),
                        ...(before ? { before: before as Signature } : {}),
                    })
                    .send(),
            { retryTransport: true },
        );
        collected.push(
            ...batch.map((entry) => ({
                signature: entry.signature as string,
                err: entry.err,
                slot: BigInt(entry.slot),
                blockTime: entry.blockTime === null ? null : BigInt(entry.blockTime),
            })),
        );
        // A short page means we reached the cursor (or the chain's history end):
        // everything between it and the tip is now in hand.
        if (batch.length < limit) {
            reachedCursor = true;
            break;
        }
        // First run: there is no cursor to reach, so the backfill window is the
        // whole job by definition and starting from it commits to nothing.
        if (!cursor) {
            reachedCursor = true;
            break;
        }
        before = batch[batch.length - 1]?.signature as string;
    }
    return { entries: collected.reverse(), reachedCursor }; // RPC is newest-first
}

/** One poll cycle. Returns counts for logging/monitoring. */
export async function pollOnce(
    opts: IndexerOptions,
): Promise<{ signatures: number; events: number; skipped: number; deferred: number }> {
    const cursor = await loadCursor(opts.db);
    const { entries, reachedCursor } = await collectNewSignatures(opts, cursor);

    // The walk pages down from the tip, so a gap it could not cover is missing
    // its OLDEST end, not its newest. Processing what came back would march the
    // cursor to the tip and strand everything below it permanently — a silent
    // hole in the money ledger. Refuse the cycle instead: nothing is lost, the
    // backlog keeps waiting, and the operator is told exactly which knob fixes
    // it. Halting loudly beats losing charges quietly.
    if (!reachedCursor) {
        const depth = `${opts.maxPagesPerPoll} pages (${opts.maxPagesPerPoll * PAGE_LIMIT} signatures)`;
        const why =
            'The oldest signatures in it were never fetched, so advancing the cursor would skip them for good.';
        console.error(
            `[indexer] HALTED: the backlog since ${cursor} is deeper than ${depth}. ${why} Nothing was processed this cycle. Raise INDEXER_MAX_PAGES until the backlog is covered.`,
        );
        return { signatures: 0, events: 0, skipped: 0, deferred: entries.length };
    }

    // Bound the per-transaction work. Because `entries` is oldest-first, a
    // prefix keeps the cursor contiguous: whatever is left over is simply the
    // start of the next cycle.
    const batch = entries.slice(0, opts.maxSignaturesPerCycle);
    let eventCount = 0;
    let skippedCount = 0;
    let processed = 0;

    for (const entry of batch) {
        if (entry.err === null) {
            const tx = await withRetry(
                () =>
                    opts.rpc
                        .getTransaction(entry.signature as Signature, {
                            encoding: 'jsonParsed',
                            maxSupportedTransactionVersion: 0,
                        })
                        .send(),
                { retryTransport: true },
            );
            // A signature the node just listed but will not return usually means
            // the node is behind. Skipping it would advance the cursor past a
            // transaction whose events we never read, so stop the cycle here and
            // retry from the same place next poll. If it stays missing the node
            // has pruned that history, and the log says which signature to point
            // an archival RPC at — again, better stuck than silently short.
            if (!tx) {
                const advice =
                    'If this repeats, the node has likely pruned that history — point SOLANA_RPC_URL at one that retains it.';
                console.error(
                    `[indexer] HALTED at ${entry.signature}: this RPC node did not return the transaction. The cursor was not advanced past it; retrying next poll. ${advice}`,
                );
                break;
            }
            const { events, skipped } = extractEventsFromTransaction(tx, SUBSCRIPTIONS_PROGRAM_ADDRESS);
            // Undecodable events are a gap, not a reason to stop: the cursor
            // still advances below. Loud, per occurrence, because a silent gap
            // in a billing ledger is worse than a noisy log.
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
            await sleep(opts.txDelayMs);
        }
        // Cursor advances per signature so a kill mid-batch resumes precisely.
        await saveCursor(opts.db, entry.signature);
        processed++;
    }

    return {
        signatures: processed,
        events: eventCount,
        skipped: skippedCount,
        deferred: entries.length - processed,
    };
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
            const { signatures, events, skipped, deferred } = await pollOnce(opts);
            if (signatures > 0) {
                console.log(
                    `[indexer] processed ${signatures} signatures, ${events} new events` +
                        `${skipped > 0 ? `, ${skipped} SKIPPED (see errors above)` : ''}` +
                        `${deferred > 0 ? `, ${deferred} left for the next cycle` : ''}`,
                );
            }
        },
    });
}
