/**
 * Integration tests for the API logic layer (auth + queries), run against an
 * in-memory PGlite database under vitest. This exercises the same functions
 * the route handlers call; the routes themselves are thin auth-check + json
 * wrappers. (PGlite runs here because vitest is a plain Node process — it is
 * NOT used inside the Next.js server, which requires postgres://.)
 */
import { type KairosDb, buildSignInMessage, createDb, dbSchema } from '@kairos/core';
import { generateKeyPairSigner, getBase58Decoder } from '@solana/kit';
import { beforeAll, describe, expect, it } from 'vitest';
import { authenticate, issueNonceToken, issueSession, verifySignIn } from '../lib/auth.js';
import { getMetrics, listCharges, listPlans, listSubscriptions } from '../lib/queries.js';

process.env.AUTH_SECRET = 'test-secret';

let db: KairosDb;
const merchantA = 'MerchantAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const merchantB = 'MerchantBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

beforeAll(async () => {
    db = await createDb('pglite://memory', { migrate: true });

    // Two merchants, one plan each.
    await db.insert(dbSchema.plans).values([
        {
            planPda: 'planA',
            owner: merchantA,
            planId: '1',
            mint: 'mintX',
            amount: '5000000', // 5 tokens
            periodHours: 730n, // monthly -> MRR == amount
            status: 'active',
            endTs: 0n,
            destinations: [merchantA],
            pullers: ['puller'],
            metadataUri: '',
            createdAtChain: 1n,
        },
        {
            planPda: 'planB',
            owner: merchantB,
            planId: '1',
            mint: 'mintX',
            amount: '9000000',
            periodHours: 730n,
            status: 'active',
            endTs: 0n,
            destinations: [merchantB],
            pullers: ['puller'],
            metadataUri: '',
            createdAtChain: 1n,
        },
    ]);

    // Merchant A: 2 active subs + 1 cancelled (recent); Merchant B: 1 active.
    await db.insert(dbSchema.subscriptions).values([
        {
            subscriptionPda: 'subA1',
            planPda: 'planA',
            subscriber: 'userA1',
            mint: 'mintX',
            status: 'active',
            createdTs: 100n,
            currentPeriodStartTs: 100n,
        },
        {
            subscriptionPda: 'subA2',
            planPda: 'planA',
            subscriber: 'userA2',
            mint: 'mintX',
            status: 'active',
            createdTs: 200n,
            currentPeriodStartTs: 200n,
        },
        {
            subscriptionPda: 'subA3',
            planPda: 'planA',
            subscriber: 'userA3',
            mint: 'mintX',
            status: 'cancelled',
            createdTs: 300n,
            currentPeriodStartTs: 300n,
            expiresAtTs: 999n,
        },
        {
            subscriptionPda: 'subB1',
            planPda: 'planB',
            subscriber: 'userB1',
            mint: 'mintX',
            status: 'active',
            createdTs: 100n,
            currentPeriodStartTs: 100n,
        },
    ]);

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    await db.insert(dbSchema.charges).values([
        {
            subscriptionPda: 'subA1',
            planPda: 'planA',
            subscriber: 'userA1',
            mint: 'mintX',
            amount: '5000000',
            status: 'succeeded',
            signature: 'sigA1',
            executedAt: nowSec - 100n,
        },
        {
            subscriptionPda: 'subA2',
            planPda: 'planA',
            subscriber: 'userA2',
            mint: 'mintX',
            amount: '5000000',
            status: 'failed',
            errorCode: 'insufficient_funds',
        },
        {
            subscriptionPda: 'subB1',
            planPda: 'planB',
            subscriber: 'userB1',
            mint: 'mintX',
            amount: '9000000',
            status: 'succeeded',
            signature: 'sigB1',
            executedAt: nowSec - 50n,
        },
    ]);
});

describe('SIWS auth', () => {
    it('verifies a real wallet signature bound to a server nonce', async () => {
        const signer = await generateKeyPairSigner();
        const message = buildSignInMessage({
            domain: 'localhost',
            address: signer.address,
            nonce: 'abc123',
            issuedAt: new Date().toISOString(),
        });
        const nonceToken = await issueNonceToken(signer.address, message);
        const signed = await signer.signMessages([
            { content: new TextEncoder().encode(message), signatures: {} },
        ]);
        const sigBytes = signed[0]?.[signer.address];
        if (!sigBytes) throw new Error('sign failed');
        const signature = getBase58Decoder().decode(sigBytes);

        expect(await verifySignIn({ address: signer.address, message, signature, nonceToken })).toBe(true);
    });

    it('rejects a tampered message, wrong address, and missing nonce binding', async () => {
        const signer = await generateKeyPairSigner();
        const message = buildSignInMessage({
            domain: 'localhost',
            address: signer.address,
            nonce: 'n',
            issuedAt: new Date().toISOString(),
        });
        const nonceToken = await issueNonceToken(signer.address, message);
        const signed = await signer.signMessages([
            { content: new TextEncoder().encode(message), signatures: {} },
        ]);
        const signature = getBase58Decoder().decode(signed[0]?.[signer.address] as Uint8Array);

        // tampered message (signature no longer matches, and nonce hash differs)
        expect(
            await verifySignIn({ address: signer.address, message: `${message} `, signature, nonceToken }),
        ).toBe(false);
        // a different signer's address with this signature
        const other = await generateKeyPairSigner();
        expect(await verifySignIn({ address: other.address, message, signature, nonceToken })).toBe(false);
    });

    it('round-trips a session token through authenticate()', async () => {
        const token = await issueSession(merchantA);
        const req = new Request('http://x/api/v1/plans', { headers: { authorization: `Bearer ${token}` } });
        expect(await authenticate(req)).toBe(merchantA);
        expect(await authenticate(new Request('http://x'))).toBeNull();
        expect(
            await authenticate(new Request('http://x', { headers: { authorization: 'Bearer garbage' } })),
        ).toBeNull();
    });
});

describe('queries are merchant-scoped', () => {
    it('listPlans returns only the merchant own plans', async () => {
        const a = await listPlans(db, merchantA);
        expect(a.map((p) => p.planPda)).toEqual(['planA']);
        const b = await listPlans(db, merchantB);
        expect(b.map((p) => p.planPda)).toEqual(['planB']);
    });

    it('listSubscriptions scopes by plan owner and filters by plan', async () => {
        const a = await listSubscriptions(db, merchantA);
        expect(a.map((s) => s.subscriptionPda).sort()).toEqual(['subA1', 'subA2', 'subA3']);
        expect(await listSubscriptions(db, merchantB)).toHaveLength(1);
        const filtered = await listSubscriptions(db, merchantA, 'planA');
        expect(filtered).toHaveLength(3);
    });

    it('listCharges returns only the merchant charges (succeeded + failed)', async () => {
        const a = await listCharges(db, merchantA);
        expect(a).toHaveLength(2);
        expect(a.some((c) => c.status === 'failed' && c.errorCode === 'insufficient_funds')).toBe(true);
        expect(await listCharges(db, merchantB)).toHaveLength(1);
    });
});

describe('metrics', () => {
    it('computes MRR, active subscribers, churn, and revenue for the merchant', async () => {
        const m = await getMetrics(db, merchantA);
        // 2 active subs * 5 tokens, monthly period -> MRR == 10_000_000 base units
        expect(m.mrr).toBe('10000000');
        expect(m.activeSubscribers).toBe(2);
        expect(m.canceledLast30d).toBe(1);
        // churn = 1 / (2 + 1)
        expect(m.churnRate).toBeCloseTo(1 / 3, 5);
        expect(m.revenueLast30d).toBe('5000000');
        expect(m.mints).toEqual(['mintX']);
        expect(m.revenueSeries.length).toBeGreaterThanOrEqual(1);
    });

    it('is isolated per merchant', async () => {
        const m = await getMetrics(db, merchantB);
        expect(m.mrr).toBe('9000000');
        expect(m.activeSubscribers).toBe(1);
        expect(m.revenueLast30d).toBe('9000000');
    });
});
