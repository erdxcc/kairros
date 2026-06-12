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
import { type KairosDb, dbSchema, sleep } from '@kairos/core';
import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

export interface DispatcherOptions {
    db: KairosDb;
    maxAttempts: number;
}

/** Backoff schedule between delivery attempts. */
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];

function nextDelay(attempts: number): number {
    return RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 21_600_000;
}

export function signPayload(secret: string, timestampSec: number, body: string): string {
    const mac = createHmac('sha256', secret).update(`${timestampSec}.${body}`).digest('hex');
    return `t=${timestampSec},v1=${mac}`;
}

/** Routes fresh outbox rows into per-endpoint delivery rows. */
async function fanOut(db: KairosDb): Promise<number> {
    const events = await db
        .select()
        .from(dbSchema.outbox)
        .where(isNull(dbSchema.outbox.processedAt))
        .orderBy(dbSchema.outbox.id)
        .limit(50);
    if (events.length === 0) return 0;

    let created = 0;
    for (const event of events) {
        // Every kairos event payload carries the plan PDA — the merchant is its owner.
        const planPda = (event.payload as Record<string, unknown>).plan as string | undefined;
        let endpoints: Array<{ id: number }> = [];
        if (planPda) {
            const owners = await db
                .select({ owner: dbSchema.plans.owner })
                .from(dbSchema.plans)
                .where(eq(dbSchema.plans.planPda, planPda))
                .limit(1);
            const owner = owners[0]?.owner;
            if (owner) {
                endpoints = await db
                    .select({ id: dbSchema.webhookEndpoints.id })
                    .from(dbSchema.webhookEndpoints)
                    .where(
                        and(
                            eq(dbSchema.webhookEndpoints.merchant, owner),
                            eq(dbSchema.webhookEndpoints.active, true),
                        ),
                    );
            }
        }
        await db.transaction(async (tx) => {
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
        });
        created += endpoints.length;
    }
    return created;
}

/** Attempts all deliveries that are due (pending, or failed with elapsed backoff). */
async function attemptDeliveries(opts: DispatcherOptions): Promise<{ ok: number; failed: number }> {
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
        .where(
            and(
                inArray(dbSchema.webhookDeliveries.status, ['pending', 'failed']),
                lte(dbSchema.webhookDeliveries.nextAttemptAt, sql`now()`),
            ),
        )
        .limit(20);

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
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'kairos-signature': signPayload(secret, timestamp, body),
                    'kairos-event': delivery.eventType,
                    'kairos-delivery': String(delivery.id),
                },
                body,
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
                `[webhooks] delivery #${delivery.id} attempt ${attempts} failed (${errorText})${dead ? ' — DEAD' : ''}`,
            );
        }
    }
    return { ok, failed: failedCount };
}

export interface DispatcherRunOptions extends DispatcherOptions {
    pollIntervalMs: number;
    stopSignal: { stopped: boolean };
}

export async function runDispatcher(opts: DispatcherRunOptions): Promise<void> {
    console.log(`[webhooks] dispatcher started (cycle every ${opts.pollIntervalMs / 1000}s)`);
    while (!opts.stopSignal.stopped) {
        try {
            await fanOut(opts.db);
            await attemptDeliveries(opts);
        } catch (error) {
            console.error('[webhooks] cycle error:', error);
        }
        await sleep(opts.pollIntervalMs);
    }
    console.log('[webhooks] stopped');
}
