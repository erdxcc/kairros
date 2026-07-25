/**
 * Reconciler: periodically re-reads on-chain accounts behind our projections
 * and repairs drift. Two reasons this exists:
 *
 *   1. `updatePlan` emits NO event: plan status/pullers/metadata changes are
 *      invisible to the event indexer.
 *   2. Defense in depth: if the indexer ever skips an event (RPC pruning,
 *      bugs), the account state heals the projections.
 *
 * Uses getMultipleAccounts batching (100/call) via the SDK's fetchAllMaybe*.
 */
import { type KairosDb, dbSchema, planRowFromAccount, runLeasedLoop, sleep, withRetry } from '@kairos/core';
import { address, type createSolanaRpc } from '@solana/kit';
import { fetchAllMaybePlan, fetchAllMaybeSubscriptionDelegation } from '@solana/subscriptions';
import { eq, inArray, ne, sql } from 'drizzle-orm';

type Rpc = ReturnType<typeof createSolanaRpc>;

export interface ReconcilerOptions {
    db: KairosDb;
    rpc: Rpc;
    /** Max plan rows re-read per sweep. */
    planLimit: number;
    /** Max subscription rows re-read per sweep. */
    subscriptionLimit: number;
}

const BATCH = 100;

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/**
 * Marks a set of rows as compared-against-chain, whether or not anything
 * changed. `reconciled_at` is what makes the sweep bounded: ordering by it
 * ascending means each pass picks up the stalest rows and the whole table
 * cycles, instead of every pass re-reading everything.
 */
async function markReconciled(
    db: KairosDb,
    table: typeof dbSchema.plans | typeof dbSchema.subscriptions,
    keys: string[],
): Promise<void> {
    if (keys.length === 0) return;
    const key = table === dbSchema.plans ? dbSchema.plans.planPda : dbSchema.subscriptions.subscriptionPda;
    await db.update(table).set({ reconciledAt: sql`now()` }).where(inArray(key, keys));
}

async function reconcilePlans(opts: ReconcilerOptions): Promise<number> {
    const rows = await opts.db
        .select({ planPda: dbSchema.plans.planPda, status: dbSchema.plans.status })
        .from(dbSchema.plans)
        // 'closed' is the one terminal state: the account is confirmed gone.
        // 'unresolved' is explicitly included, because those rows exist only
        // because a read failed and this is what retries them.
        .where(ne(dbSchema.plans.status, 'closed'))
        .orderBy(sql`${dbSchema.plans.reconciledAt} asc nulls first`)
        .limit(opts.planLimit);
    let fixes = 0;

    for (const batch of chunk(rows, BATCH)) {
        const accounts = await withRetry(() =>
            fetchAllMaybePlan(
                opts.rpc,
                batch.map((r) => address(r.planPda)),
            ),
        );
        for (const account of accounts) {
            const row = batch.find((r) => r.planPda === account.address);
            if (!row) continue;
            if (!account.exists) {
                await opts.db
                    .update(dbSchema.plans)
                    .set({ status: 'closed', updatedAt: sql`now()` })
                    .where(eq(dbSchema.plans.planPda, account.address));
                fixes++;
                console.log(`[reconciler] plan ${account.address.slice(0, 12)}… closed on-chain`);
                continue;
            }
            // Full re-map, not just the fields we once thought were mutable:
            // `updatePlan` emits no event, so this sweep is the only thing that
            // can notice a changed amount or period, and the scheduler bills
            // from exactly those columns.
            const next = planRowFromAccount(account.address, account.data);
            const result = await opts.db
                .update(dbSchema.plans)
                .set({
                    owner: next.owner,
                    planId: next.planId,
                    mint: next.mint,
                    amount: next.amount,
                    periodHours: next.periodHours,
                    status: next.status,
                    endTs: next.endTs,
                    destinations: next.destinations,
                    pullers: next.pullers,
                    metadataUri: next.metadataUri,
                    createdAtChain: next.createdAtChain,
                    updatedAt: sql`now()`,
                })
                .where(
                    sql`${dbSchema.plans.planPda} = ${account.address} and (
                        ${dbSchema.plans.owner} != ${next.owner}
                        or ${dbSchema.plans.status} != ${next.status}
                        or ${dbSchema.plans.amount} != ${next.amount}
                        or ${dbSchema.plans.periodHours} != ${next.periodHours}
                        or ${dbSchema.plans.mint} != ${next.mint}
                        or ${dbSchema.plans.endTs} != ${next.endTs}
                        or ${dbSchema.plans.destinations}::text != ${JSON.stringify(next.destinations)}
                        or ${dbSchema.plans.pullers}::text != ${JSON.stringify(next.pullers)}
                        or ${dbSchema.plans.metadataUri} != ${next.metadataUri}
                    )`,
                );
            const changed = (result as unknown as { rowCount?: number }).rowCount ?? 0;
            if (changed > 0) {
                fixes += changed;
                const what = row.status === 'unresolved' ? 'resolved' : 'synced';
                console.log(`[reconciler] plan ${account.address.slice(0, 12)}… ${what}`);
            }
        }
        await markReconciled(
            opts.db,
            dbSchema.plans,
            batch.map((r) => r.planPda),
        );
        await sleep(400);
    }
    return fixes;
}

async function reconcileSubscriptions(opts: ReconcilerOptions): Promise<number> {
    const rows = await opts.db
        .select({ subscriptionPda: dbSchema.subscriptions.subscriptionPda })
        .from(dbSchema.subscriptions)
        .where(ne(dbSchema.subscriptions.status, 'revoked'))
        .orderBy(sql`${dbSchema.subscriptions.reconciledAt} asc nulls first`)
        .limit(opts.subscriptionLimit);
    let fixes = 0;

    for (const batch of chunk(rows, BATCH)) {
        const accounts = await withRetry(() =>
            fetchAllMaybeSubscriptionDelegation(
                opts.rpc,
                batch.map((r) => address(r.subscriptionPda)),
            ),
        );
        for (const account of accounts) {
            if (!account.exists) {
                await opts.db
                    .update(dbSchema.subscriptions)
                    .set({ status: 'revoked', updatedAt: sql`now()` })
                    .where(eq(dbSchema.subscriptions.subscriptionPda, account.address));
                fixes++;
                console.log(`[reconciler] subscription ${account.address.slice(0, 12)}… revoked on-chain`);
                continue;
            }
            const sub = account.data;
            const status = sub.expiresAtTs === 0n ? 'active' : 'cancelled';
            const result = await opts.db
                .update(dbSchema.subscriptions)
                .set({
                    status,
                    currentPeriodStartTs: sub.currentPeriodStartTs,
                    amountPulledInPeriod: sub.amountPulledInPeriod.toString(),
                    expiresAtTs: sub.expiresAtTs,
                    updatedAt: sql`now()`,
                })
                .where(
                    sql`${dbSchema.subscriptions.subscriptionPda} = ${account.address} and (
                        ${dbSchema.subscriptions.status} != ${status}
                        or ${dbSchema.subscriptions.currentPeriodStartTs} != ${sub.currentPeriodStartTs}
                        or ${dbSchema.subscriptions.amountPulledInPeriod} != ${sub.amountPulledInPeriod.toString()}
                        or ${dbSchema.subscriptions.expiresAtTs} != ${sub.expiresAtTs}
                    )`,
                );
            const changed = (result as unknown as { rowCount?: number }).rowCount ?? 0;
            if (changed > 0) {
                fixes += changed;
                console.log(`[reconciler] subscription ${account.address.slice(0, 12)}… synced`);
            }
        }
        await markReconciled(
            opts.db,
            dbSchema.subscriptions,
            batch.map((r) => r.subscriptionPda),
        );
        await sleep(400);
    }
    return fixes;
}

/** How many rows are still waiting behind this sweep's limit. */
async function pendingCount(
    db: KairosDb,
    table: typeof dbSchema.plans | typeof dbSchema.subscriptions,
): Promise<number> {
    const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(
            table === dbSchema.plans
                ? ne(dbSchema.plans.status, 'closed')
                : ne(dbSchema.subscriptions.status, 'revoked'),
        );
    return row?.n ?? 0;
}

export async function reconcileOnce(opts: ReconcilerOptions): Promise<number> {
    const planFixes = await reconcilePlans(opts);
    const subFixes = await reconcileSubscriptions(opts);
    const total = planFixes + subFixes;
    console.log(
        `[reconciler] sweep complete: ${total} fixes (${planFixes} plans, ${subFixes} subscriptions)`,
    );
    // A sweep that is permanently capped means rows go stale for longer than
    // the configured interval, which is worth saying out loud rather than
    // leaving to be inferred from the chain drifting.
    const [plansPending, subsPending] = await Promise.all([
        pendingCount(opts.db, dbSchema.plans),
        pendingCount(opts.db, dbSchema.subscriptions),
    ]);
    if (plansPending > opts.planLimit || subsPending > opts.subscriptionLimit) {
        console.warn(
            `[reconciler] sweep is capped (${plansPending} plans / ${subsPending} subscriptions to cover, limits ${opts.planLimit}/${opts.subscriptionLimit}); rows cycle over several sweeps. Raise RECONCILER_PLAN_LIMIT / RECONCILER_SUBSCRIPTION_LIMIT or shorten RECONCILER_INTERVAL_MS.`,
        );
    }
    return total;
}

export interface ReconcilerRunOptions extends ReconcilerOptions {
    intervalMs: number;
    leaseTtlMs: number;
    stopSignal: { stopped: boolean };
}

export async function runReconciler(opts: ReconcilerRunOptions): Promise<void> {
    console.log(`[reconciler] sweeping every ${Math.round(opts.intervalMs / 60000)}min`);
    await runLeasedLoop({
        db: opts.db,
        name: 'reconciler',
        label: 'reconciler',
        ttlMs: opts.leaseTtlMs,
        intervalMs: opts.intervalMs,
        stopSignal: opts.stopSignal,
        tick: () => reconcileOnce(opts).then(() => undefined),
    });
}
