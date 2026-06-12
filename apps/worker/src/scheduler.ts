/**
 * Billing scheduler: finds due subscriptions on plans that authorize kairos's
 * puller key and executes `transferSubscription`.
 *
 * Truth model:
 *   - Success is never recorded here — the on-chain event lands via the
 *     indexer, which writes the succeeded charge row. The chain is the only
 *     source of truth for money movement.
 *   - Failures never reach the chain (preflight catches them for free), so
 *     the scheduler records them in `charges` and emits `charge.failed`.
 *   - One attempt per (subscription, period) in the MVP; the dunning
 *     milestone adds the retry ladder on top of these rows.
 */
import {
    type ChargeFailureKind,
    type KairosDb,
    type PullerSigner,
    classifyChargeError,
    dbSchema,
    errorChain,
    sleep,
    subscriptionDue,
    withRetry,
} from '@kairos/core';
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token';
import { type Address, address, createClient, type createSolanaRpc } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { fetchMaybeSubscriptionDelegation, subscriptionsProgram } from '@solana/subscriptions';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

type Rpc = ReturnType<typeof createSolanaRpc>;

export interface SchedulerOptions {
    db: KairosDb;
    rpc: Rpc;
    puller: PullerSigner;
    rpcUrl: string;
    /** Max charges attempted per cycle (keeps RPC usage bounded). */
    batchSize: number;
}

interface Candidate {
    subscriptionPda: string;
    planPda: string;
    subscriber: string;
    mint: string;
    planOwner: string;
    amount: string;
    periodHours: bigint;
    destinations: string[];
}

/** Subscriptions on active plans that list our puller, plausibly due per projections. */
async function findCandidates(opts: SchedulerOptions, pullerAddress: string): Promise<Candidate[]> {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const rows = await opts.db
        .select({
            subscriptionPda: dbSchema.subscriptions.subscriptionPda,
            planPda: dbSchema.subscriptions.planPda,
            subscriber: dbSchema.subscriptions.subscriber,
            mint: dbSchema.subscriptions.mint,
            planOwner: dbSchema.plans.owner,
            amount: dbSchema.plans.amount,
            periodHours: dbSchema.plans.periodHours,
            destinations: dbSchema.plans.destinations,
        })
        .from(dbSchema.subscriptions)
        .innerJoin(dbSchema.plans, eq(dbSchema.subscriptions.planPda, dbSchema.plans.planPda))
        .where(
            and(
                eq(dbSchema.subscriptions.status, 'active'),
                eq(dbSchema.plans.status, 'active'),
                sql`${dbSchema.plans.pullers} @> ${JSON.stringify([pullerAddress])}::jsonb`,
                // Cheap pre-filter on projections; the chain recheck decides.
                sql`(${dbSchema.subscriptions.amountPulledInPeriod} = 0
                     or ${dbSchema.subscriptions.currentPeriodStartTs} + ${dbSchema.plans.periodHours} * 3600 <= ${now})`,
            ),
        )
        .limit(opts.batchSize);
    return rows as Candidate[];
}

/** True when a failed attempt for this (subscription, period) is already recorded. */
async function alreadyFailedThisPeriod(
    db: KairosDb,
    subscriptionPda: string,
    periodStartTs: bigint,
): Promise<boolean> {
    const rows = await db
        .select({ id: dbSchema.charges.id })
        .from(dbSchema.charges)
        .where(
            and(
                eq(dbSchema.charges.subscriptionPda, subscriptionPda),
                eq(dbSchema.charges.status, 'failed'),
                isNotNull(dbSchema.charges.periodStartTs),
                eq(dbSchema.charges.periodStartTs, periodStartTs),
            ),
        )
        .limit(1);
    return rows.length > 0;
}

async function recordFailure(
    db: KairosDb,
    candidate: Candidate,
    periodStartTs: bigint,
    periodEndTs: bigint,
    kind: ChargeFailureKind,
    message: string,
): Promise<void> {
    await db.transaction(async (tx) => {
        await tx.insert(dbSchema.charges).values({
            subscriptionPda: candidate.subscriptionPda,
            planPda: candidate.planPda,
            subscriber: candidate.subscriber,
            mint: candidate.mint,
            amount: candidate.amount,
            periodStartTs,
            periodEndTs,
            status: 'failed',
            errorCode: kind,
        });
        await tx.insert(dbSchema.outbox).values({
            eventType: 'charge.failed',
            payload: {
                subscription: candidate.subscriptionPda,
                plan: candidate.planPda,
                subscriber: candidate.subscriber,
                mint: candidate.mint,
                amount: candidate.amount,
                periodStartTs: periodStartTs.toString(),
                failureKind: kind,
                error: message.slice(0, 500),
            },
        });
    });
}

export async function scheduleOnce(opts: SchedulerOptions): Promise<{ charged: number; failed: number }> {
    const pullerSigner = await opts.puller.getSigner();
    const pullerClient = createClient()
        .use(signer(pullerSigner))
        .use(solanaRpc({ rpcUrl: opts.rpcUrl }))
        .use(subscriptionsProgram());

    const candidates = await findCandidates(opts, pullerSigner.address);
    let charged = 0;
    let failed = 0;

    for (const candidate of candidates) {
        // Kept outside try so the catch block records the correct period
        // (the failure dedupe in alreadyFailedThisPeriod depends on it).
        let periodStart = 0n;
        let periodEnd = 0n;
        try {
            // Recheck against the chain — projections may lag the indexer.
            const onChain = await withRetry(() =>
                fetchMaybeSubscriptionDelegation(opts.rpc, address(candidate.subscriptionPda)),
            );
            if (!onChain.exists) continue; // revoked; reconciler will sync the row
            const sub = onChain.data;
            const due = subscriptionDue(
                {
                    currentPeriodStartTs: sub.currentPeriodStartTs,
                    amountPulledInPeriod: sub.amountPulledInPeriod,
                    expiresAtTs: sub.expiresAtTs,
                    amount: BigInt(candidate.amount),
                    periodHours: candidate.periodHours,
                },
                BigInt(Math.floor(Date.now() / 1000)),
            );
            if (!due) continue;

            const periodLen = candidate.periodHours * 3600n;
            periodStart =
                due === 'first-charge' ? sub.currentPeriodStartTs : sub.currentPeriodStartTs + periodLen; // program rolls forward on transfer
            periodEnd = periodStart + periodLen;

            if (await alreadyFailedThisPeriod(opts.db, candidate.subscriptionPda, periodStart)) {
                continue; // one attempt per period in the MVP; dunning adds retries
            }

            // Receiver: first allowed destination (or the plan owner when unrestricted).
            const destination = candidate.destinations[0] ?? candidate.planOwner;
            const [receiverAta] = await findAssociatedTokenPda({
                owner: address(destination),
                mint: address(candidate.mint),
                tokenProgram: TOKEN_PROGRAM_ADDRESS,
            });
            const { value: ataInfo } = await withRetry(() =>
                opts.rpc.getAccountInfo(receiverAta, { encoding: 'base64' }).send(),
            );
            if (!ataInfo) {
                console.warn(`[scheduler] receiver ATA missing for plan ${candidate.planPda}`);
                await recordFailure(
                    opts.db,
                    candidate,
                    periodStart,
                    periodEnd,
                    'receiver_ata_missing',
                    `Receiver token account ${receiverAta} (owner ${destination}) does not exist`,
                );
                failed++;
                continue;
            }

            const result = await withRetry(() =>
                pullerClient.subscriptions.instructions
                    .transferSubscription({
                        amount: BigInt(candidate.amount),
                        delegator: address(candidate.subscriber),
                        planPda: address(candidate.planPda),
                        subscriptionPda: address(candidate.subscriptionPda),
                        receiverAta,
                        tokenMint: address(candidate.mint),
                        tokenProgram: TOKEN_PROGRAM_ADDRESS,
                    })
                    .sendTransaction(),
            );
            charged++;
            console.log(
                `[scheduler] charged ${candidate.amount} (${due}) on ${candidate.subscriptionPda.slice(0, 12)}…`,
            );
            void result; // success lands via the indexer's chain event
        } catch (error) {
            const message = errorChain(error);
            const kind = classifyChargeError(message);
            if (kind === 'already_charged' || kind === 'not_due') {
                continue; // benign race with another puller or clock skew
            }
            console.warn(`[scheduler] charge failed (${kind}) on ${candidate.subscriptionPda.slice(0, 12)}…`);
            await recordFailure(opts.db, candidate, periodStart, periodEnd, kind, message).catch(
                (recordError) => console.error('[scheduler] failed to record failure:', recordError),
            );
            failed++;
        }
        await sleep(500);
    }
    return { charged, failed };
}

export interface SchedulerRunOptions extends SchedulerOptions {
    pollIntervalMs: number;
    stopSignal: { stopped: boolean };
}

export async function runScheduler(opts: SchedulerRunOptions): Promise<void> {
    const pullerAddress = (await opts.puller.getSigner()).address;
    console.log(`[scheduler] billing key ${pullerAddress} (cycle every ${opts.pollIntervalMs / 1000}s)`);
    while (!opts.stopSignal.stopped) {
        try {
            const { charged, failed } = await scheduleOnce(opts);
            if (charged + failed > 0) {
                console.log(`[scheduler] cycle done: ${charged} charged, ${failed} failed`);
            }
        } catch (error) {
            console.error('[scheduler] cycle error:', error);
        }
        await sleep(opts.pollIntervalMs);
    }
    console.log('[scheduler] stopped');
}
