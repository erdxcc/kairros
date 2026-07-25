/**
 * Projections: decoded chain events -> queryable tables + outbox.
 *
 * Everything written here is rebuildable from the chain. Each event is
 * applied inside the same DB transaction that inserted its `chain_events`
 * row, so a crash can never leave a half-applied event.
 */
import {
    type KairosChainEvent,
    type KairosDb,
    dbSchema,
    planRowFromAccount,
    unresolvedPlanRow,
    withRetry,
} from '@kairos/core';
import { type Address, address, type createSolanaRpc } from '@solana/kit';
import { fetchMaybePlan, findSubscriptionDelegationPda } from '@solana/subscriptions';
import { eq, sql } from 'drizzle-orm';

type Rpc = ReturnType<typeof createSolanaRpc>;

export interface EventContext {
    signature: string;
    slot: bigint;
    blockTime: bigint | null;
}

/**
 * Plan rows are filled lazily: the first event referencing a plan triggers an
 * RPC fetch.
 *
 * A row that is still `unresolved` is re-fetched rather than trusted, because
 * that status means "we could not read the account last time", not "this is
 * what the plan says". Everything else short-circuits: real terms are the
 * reconciler's job to keep fresh, not this hot path's.
 */
export async function ensurePlanRow(db: KairosDb, rpc: Rpc, planPda: Address): Promise<void> {
    const existing = await db
        .select({ status: dbSchema.plans.status })
        .from(dbSchema.plans)
        .where(eq(dbSchema.plans.planPda, planPda))
        .limit(1);
    if (existing.length > 0 && existing[0]?.status !== 'unresolved') return;

    const account = await withRetry(() => fetchMaybePlan(rpc, planPda));
    if (!account.exists) {
        // The account did not come back. It may genuinely be gone (plans can be
        // closed after expiry) or the node may simply be behind the transaction
        // we are indexing. We cannot tell the two apart from here, so record a
        // placeholder the reconciler will revisit instead of a verdict.
        await db.insert(dbSchema.plans).values(unresolvedPlanRow(planPda)).onConflictDoNothing();
        return;
    }

    const row = planRowFromAccount(planPda, account.data);
    await db
        .insert(dbSchema.plans)
        .values(row)
        .onConflictDoUpdate({
            target: dbSchema.plans.planPda,
            // Only ever upgrades a placeholder into the real thing; a resolved
            // row is left to the reconciler so two writers cannot fight.
            set: { ...row, updatedAt: sql`now()` },
            setWhere: eq(dbSchema.plans.status, 'unresolved'),
        });
}

function jsonPayload(event: KairosChainEvent): Record<string, string> {
    return JSON.parse(JSON.stringify(event, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/**
 * Idempotently ingests one extracted event: inserts the chain_events row and,
 * if it is new, applies the projection and emits outbox entries.
 * Returns true when the event was new.
 */
export async function ingestEvent(
    db: KairosDb,
    rpc: Rpc,
    ctx: EventContext,
    position: { outerIxIndex: number; innerIxIndex: number },
    event: KairosChainEvent,
): Promise<boolean> {
    // Resolve everything that needs RPC/async work before the DB transaction.
    if ('plan' in event) {
        await ensurePlanRow(db, rpc, event.plan);
    }
    const subscriptionPda =
        'plan' in event && 'subscriber' in event
            ? (await findSubscriptionDelegationPda({ planPda: event.plan, subscriber: event.subscriber }))[0]
            : event.kind === 'subscriptionTransfer'
              ? event.subscription
              : undefined;

    return await db.transaction(async (tx) => {
        const inserted = await tx
            .insert(dbSchema.chainEvents)
            .values({
                signature: ctx.signature,
                outerIxIndex: position.outerIxIndex,
                innerIxIndex: position.innerIxIndex,
                slot: ctx.slot,
                blockTime: ctx.blockTime,
                kind: event.kind,
                payload: jsonPayload(event),
            })
            .onConflictDoNothing()
            .returning({ id: dbSchema.chainEvents.id });
        const chainEventId = inserted[0]?.id;
        if (chainEventId === undefined) return false; // already ingested

        const emit = async (eventType: string, payload: Record<string, unknown>) => {
            await tx.insert(dbSchema.outbox).values({
                eventType,
                payload: {
                    ...payload,
                    signature: ctx.signature,
                    blockTime: ctx.blockTime?.toString() ?? null,
                },
            });
        };

        switch (event.kind) {
            case 'subscriptionCreated': {
                if (!subscriptionPda) throw new Error('unreachable: created event without pda');
                await tx
                    .insert(dbSchema.subscriptions)
                    .values({
                        subscriptionPda,
                        planPda: event.plan,
                        subscriber: event.subscriber,
                        mint: event.mint,
                        status: 'active',
                        createdTs: event.createdTs,
                        currentPeriodStartTs: event.createdTs,
                    })
                    .onConflictDoUpdate({
                        target: dbSchema.subscriptions.subscriptionPda,
                        set: {
                            status: 'active',
                            createdTs: event.createdTs,
                            currentPeriodStartTs: event.createdTs,
                            expiresAtTs: 0n,
                            updatedAt: sql`now()`,
                        },
                    });
                await emit('subscription.created', jsonPayload(event));
                break;
            }
            case 'subscriptionTransfer': {
                await tx
                    .update(dbSchema.subscriptions)
                    .set({
                        currentPeriodStartTs: event.periodStartTs,
                        amountPulledInPeriod: event.amountPulledInPeriod.toString(),
                        updatedAt: sql`now()`,
                    })
                    .where(eq(dbSchema.subscriptions.subscriptionPda, event.subscription));
                await tx
                    .insert(dbSchema.charges)
                    .values({
                        chainEventId,
                        subscriptionPda: event.subscription,
                        planPda: event.plan,
                        subscriber: event.delegator,
                        mint: event.mint,
                        amount: event.amount.toString(),
                        receiver: event.receiver,
                        periodStartTs: event.periodStartTs,
                        periodEndTs: event.periodEndTs,
                        status: 'succeeded',
                        signature: ctx.signature,
                        executedAt: ctx.blockTime,
                    })
                    .onConflictDoNothing();
                await emit('charge.succeeded', jsonPayload(event));
                break;
            }
            case 'subscriptionCancelled': {
                if (!subscriptionPda) throw new Error('unreachable: cancelled event without pda');
                await tx
                    .update(dbSchema.subscriptions)
                    .set({ status: 'cancelled', expiresAtTs: event.expiresAtTs, updatedAt: sql`now()` })
                    .where(eq(dbSchema.subscriptions.subscriptionPda, subscriptionPda));
                await emit('subscription.cancelled', jsonPayload(event));
                break;
            }
            case 'subscriptionResumed': {
                if (!subscriptionPda) throw new Error('unreachable: resumed event without pda');
                await tx
                    .update(dbSchema.subscriptions)
                    .set({ status: 'active', expiresAtTs: 0n, updatedAt: sql`now()` })
                    .where(eq(dbSchema.subscriptions.subscriptionPda, subscriptionPda));
                await emit('subscription.resumed', jsonPayload(event));
                break;
            }
            case 'fixedTransfer':
            case 'recurringTransfer':
                // Recorded in chain_events for the read-only delegations surface;
                // no projection in the MVP (kairos focuses on subscription plans).
                break;
        }
        return true;
    });
}
