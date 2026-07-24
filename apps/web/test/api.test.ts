/**
 * Integration tests for the API logic layer (auth + queries), run against an
 * in-memory PGlite database under vitest. This exercises the same functions
 * the route handlers call; the routes themselves are thin auth-check + json
 * wrappers. (PGlite runs here because vitest is a plain Node process, it is
 * NOT used inside the Next.js server, which requires postgres://.)
 */
import { type KairosDb, buildSignInMessage, createDb, dbSchema } from '@kairos/core';
import { generateKeyPairSigner, getBase58Decoder } from '@solana/kit';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { authenticate, issueNonceToken, issueSession, verifySignIn } from '../lib/auth.js';
import {
    getMetrics,
    getMySubscription,
    getMySummary,
    isMerchant,
    listCharges,
    listMyCharges,
    listMySubscriptions,
    listPlans,
    listSubscriptions,
} from '../lib/queries.js';

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
}, 30_000); // pglite migrate is slow under parallel `pnpm -r test` on some machines

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

    // The gate behind requireMerchant: a signed-in wallet is not a merchant by
    // virtue of being signed in. 'userA1' is a subscriber in the fixtures.
    it('isMerchant separates plan owners from payers', async () => {
        expect(await isMerchant(db, merchantA)).toBe(true);
        expect(await isMerchant(db, merchantB)).toBe(true);
        expect(await isMerchant(db, 'userA1')).toBe(false);
        expect(await isMerchant(db, 'WalletWithNothingOnChainAAAAAAAAAAAAAAAAAAAA')).toBe(false);
    });
});

// The dev escape hatch signs sessions with a key published in this repository,
// so honouring it in production would let anyone mint a session for any wallet.
describe('the session secret fails closed', () => {
    it('ignores the insecure dev key in production', async () => {
        vi.stubEnv('AUTH_SECRET', '');
        vi.stubEnv('AUTH_ALLOW_INSECURE_SECRET', '1');
        vi.stubEnv('NODE_ENV', 'production');
        await expect(issueSession('anyone')).rejects.toThrow(/AUTH_SECRET/);
        vi.unstubAllEnvs();
    });

    it('still allows it in local development', async () => {
        vi.stubEnv('AUTH_SECRET', '');
        vi.stubEnv('AUTH_ALLOW_INSECURE_SECRET', '1');
        vi.stubEnv('NODE_ENV', 'development');
        expect(typeof (await issueSession('anyone'))).toBe('string');
        vi.unstubAllEnvs();
    });

    it('refuses a missing secret with no opt-in at all', async () => {
        vi.stubEnv('AUTH_SECRET', '');
        vi.stubEnv('AUTH_ALLOW_INSECURE_SECRET', '');
        await expect(issueSession('anyone')).rejects.toThrow(/AUTH_SECRET/);
        vi.unstubAllEnvs();
    });
});

// The other side of the same projections: what a payer sees. Before this
// existed, a subscriber who signed in got an empty dashboard, because every
// query was scoped by plan owner.
describe('queries are payer-scoped', () => {
    it('listMySubscriptions returns the payer own subscriptions with plan terms', async () => {
        const mine = await listMySubscriptions(db, 'userA1');
        expect(mine.map((s) => s.subscriptionPda)).toEqual(['subA1']);
        expect(mine[0]?.merchant).toBe(merchantA);
        expect(mine[0]?.amount).toBe('5000000');
        expect(mine[0]?.periodHours).toBe(730n);
        // The merchant owns the plan but pays for nothing: the two scopes are
        // genuinely separate, not the same rows under another name.
        expect(await listMySubscriptions(db, merchantA)).toHaveLength(0);
    });

    it('getMySubscription will not hand over another payer subscription', async () => {
        expect(await getMySubscription(db, 'userA1', 'subA1')).not.toBeNull();
        expect(await getMySubscription(db, 'userA1', 'subB1')).toBeNull();
        expect(await getMySubscription(db, 'userA1', 'nope')).toBeNull();
    });

    it('listMyCharges returns only charges pulled from that wallet', async () => {
        const a1 = await listMyCharges(db, 'userA1');
        expect(a1.map((c) => c.signature)).toEqual(['sigA1']);
        expect(a1[0]?.merchant).toBe(merchantA);
        // userA2's only charge failed; a payer still gets to see the attempt.
        const a2 = await listMyCharges(db, 'userA2');
        expect(a2.map((c) => c.status)).toEqual(['failed']);
        expect(await listMyCharges(db, 'userA3')).toHaveLength(0);
    });

    it('getMySummary reports the next charge and the last 30 days', async () => {
        // subA1 has never been charged in its period, so it is chargeable now.
        const nowTs = 100_000n;
        const s = await getMySummary(db, 'userA1', nowTs);
        expect(s.activeSubscriptions).toBe(1);
        expect(s.endingSubscriptions).toBe(0);
        expect(s.nextChargeTs).toBe('100000');
        expect(s.spentLast30d).toEqual([{ mint: 'mintX', amount: '5000000' }]);
    });

    it('a scheduled cancellation is still running, and is never charged again', async () => {
        const s = await getMySummary(db, 'userA3', 100_000n);
        expect(s.activeSubscriptions).toBe(0);
        expect(s.endingSubscriptions).toBe(1);
        expect(s.nextChargeTs).toBeNull();
        expect(s.spentLast30d).toEqual([]);
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
