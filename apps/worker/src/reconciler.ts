/**
 * Reconciler: periodically re-reads on-chain accounts behind our projections
 * and repairs drift. Two reasons this exists:
 *
 *   1. `updatePlan` emits NO event — plan status/pullers/metadata changes are
 *      invisible to the event indexer.
 *   2. Defense in depth: if the indexer ever skips an event (RPC pruning,
 *      bugs), the account state heals the projections.
 *
 * Uses getMultipleAccounts batching (100/call) via the SDK's fetchAllMaybe*.
 */
import { type KairosDb, dbSchema, sleep, withRetry } from '@kairos/core';
import { address, type createSolanaRpc } from '@solana/kit';
import { fetchAllMaybePlan, fetchAllMaybeSubscriptionDelegation } from '@solana/subscriptions';
import { eq, ne, sql } from 'drizzle-orm';

type Rpc = ReturnType<typeof createSolanaRpc>;

export interface ReconcilerOptions {
    db: KairosDb;
    rpc: Rpc;
}

const BATCH = 100;

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

async function reconcilePlans(opts: ReconcilerOptions): Promise<number> {
    const rows = await opts.db
        .select({ planPda: dbSchema.plans.planPda, status: dbSchema.plans.status })
        .from(dbSchema.plans)
        .where(ne(dbSchema.plans.status, 'closed'));
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
            const data = account.data.data;
            const status = account.data.status === 1 ? 'active' : 'sunset';
            const zero = '11111111111111111111111111111111';
            const result = await opts.db
                .update(dbSchema.plans)
                .set({
                    status,
                    endTs: data.endTs,
                    pullers: data.pullers.filter((p: string) => p !== zero),
                    metadataUri: data.metadataUri,
                    updatedAt: sql`now()`,
                })
                .where(
                    sql`${dbSchema.plans.planPda} = ${account.address} and (
                        ${dbSchema.plans.status} != ${status}
                        or ${dbSchema.plans.endTs} != ${data.endTs}
                        or ${dbSchema.plans.pullers}::text != ${JSON.stringify(data.pullers.filter((p: string) => p !== zero))}
                        or ${dbSchema.plans.metadataUri} != ${data.metadataUri}
                    )`,
                );
            const changed = (result as unknown as { rowCount?: number }).rowCount ?? 0;
            if (changed > 0) {
                fixes += changed;
                console.log(`[reconciler] plan ${account.address.slice(0, 12)}… synced (mutable fields)`);
            }
        }
        await sleep(400);
    }
    return fixes;
}

async function reconcileSubscriptions(opts: ReconcilerOptions): Promise<number> {
    const rows = await opts.db
        .select({ subscriptionPda: dbSchema.subscriptions.subscriptionPda })
        .from(dbSchema.subscriptions)
        .where(ne(dbSchema.subscriptions.status, 'revoked'));
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
        await sleep(400);
    }
    return fixes;
}

export async function reconcileOnce(opts: ReconcilerOptions): Promise<number> {
    const planFixes = await reconcilePlans(opts);
    const subFixes = await reconcileSubscriptions(opts);
    const total = planFixes + subFixes;
    console.log(
        `[reconciler] sweep complete: ${total} fixes (${planFixes} plans, ${subFixes} subscriptions)`,
    );
    return total;
}

export interface ReconcilerRunOptions extends ReconcilerOptions {
    intervalMs: number;
    stopSignal: { stopped: boolean };
}

export async function runReconciler(opts: ReconcilerRunOptions): Promise<void> {
    console.log(`[reconciler] sweeping every ${Math.round(opts.intervalMs / 60000)}min`);
    while (!opts.stopSignal.stopped) {
        try {
            await reconcileOnce(opts);
        } catch (error) {
            console.error('[reconciler] sweep error:', error);
        }
        // Sleep in small steps so shutdown stays responsive.
        const deadline = Date.now() + opts.intervalMs;
        while (Date.now() < deadline && !opts.stopSignal.stopped) {
            await sleep(1000);
        }
    }
    console.log('[reconciler] stopped');
}
