/**
 * Integration tests for the webhook dispatcher against an in-memory PGlite DB.
 * Fan-out routing, delivery outcomes (succeed / retry / dead-letter), the SSRF
 * guard, and the pure signing/backoff helpers.
 */
import { type KairosDb, createDb, dbSchema } from '@kairos/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptDeliveries, fanOut, nextDelay, signPayload } from '../src/dispatcher.js';

const MERCHANT = 'MerchantAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PLAN_PDA = 'planA';

let db: KairosDb;

async function seedEndpoint(url: string): Promise<number> {
    await db.insert(dbSchema.plans).values({
        planPda: PLAN_PDA,
        owner: MERCHANT,
        planId: '1',
        mint: 'mintX',
        amount: '5000000',
        periodHours: 730n,
        status: 'active',
        endTs: 0n,
        destinations: [MERCHANT],
        pullers: ['puller'],
        createdAtChain: 1n,
    });
    const inserted = await db
        .insert(dbSchema.webhookEndpoints)
        .values({ merchant: MERCHANT, url, secret: 'whsec_test' })
        .returning({ id: dbSchema.webhookEndpoints.id });
    await db.insert(dbSchema.outbox).values({
        eventType: 'charge.succeeded',
        payload: { plan: PLAN_PDA, hello: 'world' },
    });
    return inserted[0]?.id as number;
}

function fetchReturning(value: { ok: boolean; status: number }): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue(value as unknown as Response);
}

beforeEach(async () => {
    db = await createDb('pglite://memory', { migrate: true });
}, 30_000); // pglite migrate is slow under parallel `pnpm -r test` on some machines

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('fanOut', () => {
    it("routes an outbox event to the merchant's active endpoints", async () => {
        const endpointId = await seedEndpoint('https://hooks.example/x');
        const created = await fanOut(db);
        expect(created).toBe(1);

        const deliveries = await db.select().from(dbSchema.webhookDeliveries);
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]?.endpointId).toBe(endpointId);
        expect(deliveries[0]?.status).toBe('pending');
        expect(deliveries[0]?.eventType).toBe('charge.succeeded');

        const [event] = await db.select().from(dbSchema.outbox);
        expect(event?.processedAt).not.toBeNull();
    });

    it('does not double-deliver a processed event', async () => {
        await seedEndpoint('https://hooks.example/x');
        expect(await fanOut(db)).toBe(1);
        expect(await fanOut(db)).toBe(0); // already processed
        const deliveries = await db.select().from(dbSchema.webhookDeliveries);
        expect(deliveries).toHaveLength(1);
    });
});

describe('attemptDeliveries', () => {
    it('delivers, signs the payload, forbids redirects, and marks succeeded', async () => {
        vi.stubEnv('KAIROS_WEBHOOK_ALLOW_PRIVATE', '1');
        const fetchMock = fetchReturning({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);

        await seedEndpoint('http://127.0.0.1:9999/hook');
        await fanOut(db);
        const result = await attemptDeliveries({ db, maxAttempts: 5 });

        expect(result).toEqual({ ok: 1, failed: 0 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [calledUrl, init] = fetchMock.mock.calls[0] as [
            string,
            RequestInit & { headers: Record<string, string> },
        ];
        expect(calledUrl).toBe('http://127.0.0.1:9999/hook');
        expect(init.redirect).toBe('error');
        expect(init.headers['kairos-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

        const [delivery] = await db.select().from(dbSchema.webhookDeliveries);
        expect(delivery?.status).toBe('succeeded');
        expect(delivery?.attempts).toBe(1);
        expect(delivery?.responseStatus).toBe(200);
        expect(delivery?.deliveredAt).not.toBeNull();
    });

    it('records a failure and schedules a retry with backoff', async () => {
        vi.stubEnv('KAIROS_WEBHOOK_ALLOW_PRIVATE', '1');
        vi.stubGlobal('fetch', fetchReturning({ ok: false, status: 500 }));

        await seedEndpoint('http://127.0.0.1:9999/hook');
        await fanOut(db);
        const result = await attemptDeliveries({ db, maxAttempts: 5 });

        expect(result).toEqual({ ok: 0, failed: 1 });
        const [delivery] = await db.select().from(dbSchema.webhookDeliveries);
        expect(delivery?.status).toBe('failed');
        expect(delivery?.attempts).toBe(1);
        expect(delivery?.responseStatus).toBe(500);
        expect(delivery?.lastError).toBe('HTTP 500');
        // next attempt pushed into the future (first backoff step ~30s).
        expect(delivery?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 1000);
    });

    it('marks the delivery dead once attempts reach maxAttempts', async () => {
        vi.stubEnv('KAIROS_WEBHOOK_ALLOW_PRIVATE', '1');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

        await seedEndpoint('http://127.0.0.1:9999/hook');
        await fanOut(db);
        const result = await attemptDeliveries({ db, maxAttempts: 1 });

        expect(result).toEqual({ ok: 0, failed: 1 });
        const [delivery] = await db.select().from(dbSchema.webhookDeliveries);
        expect(delivery?.status).toBe('dead');
        expect(delivery?.attempts).toBe(1);
        expect(delivery?.lastError).toContain('ECONNREFUSED');
    });

    it('blocks delivery to a private address and never calls fetch (strict mode)', async () => {
        // No KAIROS_WEBHOOK_ALLOW_PRIVATE -> the guard is active.
        const fetchMock = fetchReturning({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);

        await seedEndpoint('https://127.0.0.1/hook'); // https passes protocol, IP is loopback
        await fanOut(db);
        const result = await attemptDeliveries({ db, maxAttempts: 5 });

        expect(result).toEqual({ ok: 0, failed: 1 });
        expect(fetchMock).not.toHaveBeenCalled();
        const [delivery] = await db.select().from(dbSchema.webhookDeliveries);
        expect(delivery?.status).toBe('failed');
        expect(delivery?.lastError).toContain('private');
    });
});

describe('signPayload / nextDelay (pure)', () => {
    it('produces a stable Stripe-style HMAC signature (known vector)', () => {
        const body = JSON.stringify({ hello: 'world' });
        expect(signPayload('whsec_test', 1_700_000_000, body)).toBe(
            't=1700000000,v1=f592bbf3951cfc94e560eecfb5d9dd4da6b0fff2e626235f8ab4b54860925d0b',
        );
    });

    it('follows the backoff ladder and clamps past the last step', () => {
        expect(nextDelay(1)).toBe(30_000);
        expect(nextDelay(2)).toBe(120_000);
        expect(nextDelay(3)).toBe(600_000);
        expect(nextDelay(4)).toBe(3_600_000);
        expect(nextDelay(5)).toBe(21_600_000);
        expect(nextDelay(6)).toBe(21_600_000); // clamped
    });
});
