/**
 * Webhook dispatcher: turns outbox events into HMAC-signed HTTP deliveries.
 *
 * Pipeline: outbox row -> route to the merchant (plan owner) -> one
 * `webhook_deliveries` row per active endpoint -> POST with retries.
 *
 * Signing (Stripe-style, documented in docs/webhooks.md):
 *   kairos-signature: t=<unix seconds>,v1=<hex hmac-sha256(secret, `${t}.${body}`)>
 */
import { createHmac } from 'node:crypto';
import {
    type KairosDb,
    assertSafeWebhookUrl,
    dbSchema,
    runLeasedLoop,
    webhookAllowPrivate,
} from '@kairos/core';
import { and, eq, inArray, sql } from 'drizzle-orm';

export interface DispatcherOptions {
    db: KairosDb;
    maxAttempts: number;
    /**
     * How long a claimed delivery is hidden from other dispatchers. Must
     * exceed one attempt (the fetch timeout is 10s) so a slow POST is not
     * picked up a second time while it is still in flight.
     */
    claimLeaseMs?: number;
}

const DEFAULT_CLAIM_LEASE_MS = 120_000;
/** Deliveries claimed per cycle. */
const DELIVERY_BATCH = 20;
/** Outbox rows fanned out per cycle. */
const FANOUT_BATCH = 50;

/** Backoff schedule between delivery attempts. */
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];

export function nextDelay(attempts: number): number {
    return RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 21_600_000;
}

export function signPayload(secret: string, timestampSec: number, body: string): string {
    const mac = createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');
    return `t=${timestampSec},v1=${mac}`;
}

/**
 * Routes fresh outbox rows into per-endpoint delivery rows.
 *
 * The pick is `for update skip locked` so a second dispatcher takes different
 * rows rather than the same ones: `webhook_deliveries` has a unique index that
 * would swallow the duplicates anyway, but doing the work twice to throw half
 * of it away is not a plan.
 */
export async function fanOut(db: KairosDb): Promise<number> {
    // One transaction around the whole batch: `skip locked` only holds its
    // rows for the life of the transaction that took them, so selecting
    // outside one would lock nothing. Everything in here is local database
    // work, so the transaction is short by construction.
    return await db.transaction(async (tx) => {
        const picked = (await tx.execute(sql`
            select id, event_type as "eventType", payload
            from ${dbSchema.outbox}
            where processed_at is null
            order by id
            limit ${FANOUT_BATCH}
            for update skip locked
        `)) as unknown as {
            rows: Array<{ id: number; eventType: string; payload: Record<string, unknown> }>;
        };
        const events = picked.rows;
        if (events.length === 0) return 0;

        let created = 0;
        for (const event of events) {
            // Every kairos event payload carries the plan PDA: the merchant is its owner.
            const planPda = event.payload.plan as string | undefined;
            let endpoints: Array<{ id: number }> = [];
            if (planPda) {
                const owners = await tx
                    .select({ owner: dbSchema.plans.owner, status: dbSchema.plans.status })
                    .from(dbSchema.plans)
                    .where(eq(dbSchema.plans.planPda, planPda))
                    .limit(1);
                const plan = owners[0];
                // An `unresolved` plan has no owner yet, only a placeholder.
                // Marking the event processed now would route it to nobody and
                // then never revisit it, so leave it for a later cycle: the
                // reconciler fills the real owner in within one sweep.
                if (plan?.status === 'unresolved') continue;
                if (plan?.owner) {
                    endpoints = await tx
                        .select({ id: dbSchema.webhookEndpoints.id })
                        .from(dbSchema.webhookEndpoints)
                        .where(
                            and(
                                eq(dbSchema.webhookEndpoints.merchant, plan.owner),
                                eq(dbSchema.webhookEndpoints.active, true),
                            ),
                        );
                }
            }
            for (const endpoint of endpoints) {
                await tx
                    .insert(dbSchema.webhookDeliveries)
                    .values({ endpointId: endpoint.id, outboxId: event.id, eventType: event.eventType })
                    .onConflictDoNothing();
            }
            await tx
                .update(dbSchema.outbox)
                .set({ processedAt: sql`now()` })
                .where(eq(dbSchema.outbox.id, event.id));
            created += endpoints.length;
        }
        return created;
    });
}

/**
 * Attempts all deliveries that are due (pending, or failed with elapsed backoff).
 *
 * Due rows are *claimed* before they are attempted: one statement pushes
 * `next_attempt_at` a lease into the future and returns the ids it moved, so a
 * concurrent dispatcher sees them as not-due and takes different work. Without
 * that, both would POST the same event, and a webhook is a side effect on
 * somebody else's system that we cannot take back. If this process dies
 * mid-flight the lease simply lapses and the delivery is retried.
 */
export async function attemptDeliveries(opts: DispatcherOptions): Promise<{ ok: number; failed: number }> {
    const claimLeaseMs = opts.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
    const claimed = (await opts.db.execute(sql`
        update ${dbSchema.webhookDeliveries}
        set next_attempt_at = now() + ${`${claimLeaseMs} milliseconds`}::interval
        where id in (
            select id from ${dbSchema.webhookDeliveries}
            where status in ('pending', 'failed') and next_attempt_at <= now()
            order by id
            limit ${DELIVERY_BATCH}
            for update skip locked
        )
        returning id
    `)) as unknown as { rows: Array<{ id: number }> };
    const claimedIds = claimed.rows.map((r) => r.id);
    if (claimedIds.length === 0) return { ok: 0, failed: 0 };

    const due = await opts.db
        .select({
            delivery: dbSchema.webhookDeliveries,
            url: dbSchema.webhookEndpoints.url,
            secret: dbSchema.webhookEndpoints.secret,
            payload: dbSchema.outbox.payload,
            createdAt: dbSchema.outbox.createdAt,
        })
        .from(dbSchema.webhookDeliveries)
        .innerJoin(
            dbSchema.webhookEndpoints,
            eq(dbSchema.webhookDeliveries.endpointId, dbSchema.webhookEndpoints.id),
        )
        .innerJoin(dbSchema.outbox, eq(dbSchema.webhookDeliveries.outboxId, dbSchema.outbox.id))
        .where(inArray(dbSchema.webhookDeliveries.id, claimedIds));

    const allowPrivate = webhookAllowPrivate();
    let ok = 0;
    let failedCount = 0;
    for (const { delivery, url, secret, payload, createdAt } of due) {
        const body = JSON.stringify({
            id: delivery.outboxId,
            type: delivery.eventType,
            created_at: createdAt.toISOString(),
            data: payload,
        });
        const timestamp = Math.floor(Date.now() / 1000);
        let responseStatus: number | null = null;
        let errorText: string | null = null;
        try {
            // Re-validate before every delivery: the URL is merchant-controlled and
            // DNS may have re-pointed to an internal address since registration.
            await assertSafeWebhookUrl(url, { allowPrivate });
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'kairos-signature': signPayload(secret, timestamp, body),
                    'kairos-event': delivery.eventType,
                    'kairos-delivery': String(delivery.id),
                },
                body,
                redirect: 'error',
                signal: AbortSignal.timeout(10_000),
            });
            responseStatus = response.status;
            if (!response.ok) errorText = `HTTP ${response.status}`;
        } catch (error) {
            errorText = error instanceof Error ? error.message : String(error);
        }

        const attempts = delivery.attempts + 1;
        if (errorText === null) {
            ok++;
            await opts.db
                .update(dbSchema.webhookDeliveries)
                .set({ status: 'succeeded', attempts, responseStatus, deliveredAt: sql`now()` })
                .where(eq(dbSchema.webhookDeliveries.id, delivery.id));
            console.log(`[webhooks] delivered ${delivery.eventType} #${delivery.id} -> ${url}`);
        } else {
            failedCount++;
            const dead = attempts >= opts.maxAttempts;
            await opts.db
                .update(dbSchema.webhookDeliveries)
                .set({
                    status: dead ? 'dead' : 'failed',
                    attempts,
                    responseStatus,
                    lastError: errorText.slice(0, 300),
                    nextAttemptAt: sql`now() + ${`${nextDelay(attempts)} milliseconds`}::interval`,
                })
                .where(eq(dbSchema.webhookDeliveries.id, delivery.id));
            console.warn(
                `[webhooks] delivery #${delivery.id} attempt ${attempts} failed (${errorText})${dead ? ': DEAD' : ''}`,
            );
        }
    }
    return { ok, failed: failedCount };
}

export interface DispatcherRunOptions extends DispatcherOptions {
    pollIntervalMs: number;
    leaseTtlMs: number;
    stopSignal: { stopped: boolean };
}

export async function runDispatcher(opts: DispatcherRunOptions): Promise<void> {
    console.log(`[webhooks] dispatcher started (cycle every ${opts.pollIntervalMs / 1000}s)`);
    await runLeasedLoop({
        db: opts.db,
        name: 'dispatcher',
        label: 'webhooks',
        ttlMs: opts.leaseTtlMs,
        intervalMs: opts.pollIntervalMs,
        stopSignal: opts.stopSignal,
        tick: async () => {
            await fanOut(opts.db);
            await attemptDeliveries(opts);
        },
    });
}
