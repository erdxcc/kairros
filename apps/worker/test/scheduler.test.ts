/**
 * Billing scheduler: what a failure is allowed to mean, and which candidates a
 * cycle is allowed to spend its batch on.
 *
 * A `charge.failed` row is not just telemetry — the payer sees it in their own
 * history, the merchant gets a webhook about it, and it blocks the retry for
 * that period. So the distinction pinned down here is between "the charge was
 * refused" and "we never got far enough to ask": an RPC failure is the second,
 * and recording it as the first invents a payment failure that never happened.
 *
 * These drive the real code path through the RPC seam rather than stubbing the
 * SDK: every read the scheduler makes before it decides anything goes through
 * `getAccountInfo`, so failing that is enough to reproduce a chain it cannot
 * read, and counting the calls shows which candidates a cycle even looked at.
 */
import { type KairosDb, createDb, dbSchema } from '@kairos/core';
import { type KeyPairSigner, generateKeyPairSigner } from '@solana/kit';
import { SUBSCRIPTIONS_PROGRAM_ADDRESS, getSubscriptionDelegationEncoder } from '@solana/subscriptions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleOnce } from '../src/scheduler.js';

let db: KairosDb;
let puller: KeyPairSigner;
let merchant: KeyPairSigner;
let subscriber: KeyPairSigner;
let mint: KeyPairSigner;
let periodStart: bigint;

// Real base58 pubkeys, not readable placeholders: the scheduler runs every PDA
// through `address()` before it reaches the RPC, so a fake string would throw
// there and every assertion below would pass for the wrong reason.
let PLAN_PDA: string;
let SUBSCRIPTION_PDA: string;
const PERIOD_HOURS = 730n;

/**
 * An RPC that fails every account read, and counts the attempts.
 *
 * The message is deliberately not a transport failure: `withRetry` would
 * otherwise back off for 14 seconds before giving up, and the behaviour under
 * test is what the scheduler does once a read has definitively failed, not how
 * long it waits first.
 */
function failingRpc() {
    const calls = { reads: 0 };
    const rpc = {
        getAccountInfo: () => ({
            send: async () => {
                calls.reads++;
                throw new Error('rpc exploded');
            },
        }),
    };
    return { rpc: rpc as never, calls };
}

/**
 * An RPC that serves one genuinely decodable delegation and nothing else.
 *
 * The bytes come from the SDK's own encoder, so the scheduler takes the normal
 * path — read the account, decide the charge is due, work out the period — and
 * then finds the receiver's token account missing. That is the case the earlier
 * tests could not reach, and the one that has to keep working: suppressing a
 * failure we never established is the fix, suppressing a real one would be a
 * new bug wearing the same clothes.
 */
function delegationRpc(delegationAddress: string, currentPeriodStartTs: bigint) {
    const bytes = getSubscriptionDelegationEncoder().encode({
        header: {
            discriminator: 4, // AccountDiscriminator.SubscriptionDelegation
            version: 1,
            bump: 255,
            delegator: subscriber.address,
            delegatee: puller.address,
            payer: subscriber.address,
            initId: 0n,
        },
        terms: { amount: 5_000_000n, periodHours: PERIOD_HOURS, createdAt: 0n },
        amountPulledInPeriod: 0n, // never charged this period -> due now
        currentPeriodStartTs,
        expiresAtTs: 0n,
    });
    const account = {
        data: [Buffer.from(bytes).toString('base64'), 'base64'],
        executable: false,
        lamports: 2_039_280n,
        owner: SUBSCRIPTIONS_PROGRAM_ADDRESS,
        rentEpoch: 0n,
        space: BigInt(bytes.length),
    };
    const calls = { addresses: [] as string[] };
    const rpc = {
        getAccountInfo: (queried: string) => ({
            send: async () => {
                calls.addresses.push(queried);
                // Only the delegation exists. Anything else asked for here is
                // the receiver ATA, which is precisely what is missing.
                return { context: { slot: 1n }, value: queried === delegationAddress ? account : null };
            },
        }),
    };
    return { rpc: rpc as never, calls };
}

function options(rpc: never) {
    return {
        db,
        rpc,
        puller: { getSigner: async () => puller },
        rpcUrl: 'http://127.0.0.1:1/rpc',
        batchSize: 10,
    };
}

async function seedDueSubscription(): Promise<void> {
    await db.insert(dbSchema.plans).values({
        planPda: PLAN_PDA,
        owner: merchant.address,
        planId: '1',
        mint: mint.address,
        amount: '5000000',
        periodHours: PERIOD_HOURS,
        status: 'active',
        endTs: 0n,
        destinations: [merchant.address],
        pullers: [puller.address],
        createdAtChain: 1n,
    });
    await db.insert(dbSchema.subscriptions).values({
        subscriptionPda: SUBSCRIPTION_PDA,
        planPda: PLAN_PDA,
        subscriber: subscriber.address,
        mint: mint.address,
        status: 'active',
        createdTs: periodStart,
        currentPeriodStartTs: periodStart,
        amountPulledInPeriod: '0',
    });
}

/** A previously recorded failed attempt, for the given period. */
async function seedFailedCharge(forPeriodStart: bigint): Promise<void> {
    await db.insert(dbSchema.charges).values({
        subscriptionPda: SUBSCRIPTION_PDA,
        planPda: PLAN_PDA,
        subscriber: subscriber.address,
        mint: mint.address,
        amount: '5000000',
        periodStartTs: forPeriodStart,
        periodEndTs: forPeriodStart + PERIOD_HOURS * 3600n,
        status: 'failed',
        errorCode: 'receiver_ata_missing',
    });
}

const chargeCount = async () => (await db.select({ id: dbSchema.charges.id }).from(dbSchema.charges)).length;
const outboxCount = async () => (await db.select({ id: dbSchema.outbox.id }).from(dbSchema.outbox)).length;

beforeEach(async () => {
    db = await createDb('pglite://memory', { migrate: true });
    const [pullerKey, merchantKey, subscriberKey, mintKey, planKey, subKey] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);
    puller = pullerKey;
    merchant = merchantKey;
    subscriber = subscriberKey;
    mint = mintKey;
    PLAN_PDA = planKey.address;
    SUBSCRIPTION_PDA = subKey.address;
    periodStart = BigInt(Math.floor(Date.now() / 1000) - 100);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await seedDueSubscription();
});

describe('a read that fails before the period is known', () => {
    it('does not invent a charge.failed', async () => {
        const { rpc, calls } = failingRpc();

        const result = await scheduleOnce(options(rpc));

        // The candidate was picked up and the read was attempted, so this is the
        // real path — and it still wrote nothing, because nothing was learned.
        expect(calls.reads).toBeGreaterThan(0);
        expect(result).toEqual({ charged: 0, failed: 0 });
        expect(await chargeCount()).toBe(0);
        expect(await outboxCount()).toBe(0);
    });

    it('leaves the subscription chargeable on the next cycle', async () => {
        const first = failingRpc();
        await scheduleOnce(options(first.rpc));

        // Nothing was recorded, so nothing suppresses the retry: the next cycle
        // reaches the chain again instead of skipping a period it "already
        // failed" only because the network hiccuped once.
        const second = failingRpc();
        await scheduleOnce(options(second.rpc));

        expect(second.calls.reads).toBeGreaterThan(0);
    });
});

describe('a failure established against the chain', () => {
    it('is recorded, with the period it was for', async () => {
        const { rpc, calls } = delegationRpc(SUBSCRIPTION_PDA, periodStart);

        const result = await scheduleOnce(options(rpc));

        // The delegation was read and the receiver ATA was looked up: the full
        // path ran, rather than bailing out early like the tests above.
        expect(calls.addresses[0]).toBe(SUBSCRIPTION_PDA);
        expect(calls.addresses).toHaveLength(2);
        expect(result).toEqual({ charged: 0, failed: 1 });

        const charges = await db
            .select({
                status: dbSchema.charges.status,
                errorCode: dbSchema.charges.errorCode,
                periodStartTs: dbSchema.charges.periodStartTs,
                periodEndTs: dbSchema.charges.periodEndTs,
            })
            .from(dbSchema.charges);
        expect(charges).toHaveLength(1);
        expect(charges[0]?.status).toBe('failed');
        expect(charges[0]?.errorCode).toBe('receiver_ata_missing');
        // The real period, not the zero that used to stand in for "we never
        // got far enough to know".
        expect(charges[0]?.periodStartTs).toBe(periodStart);
        expect(charges[0]?.periodEndTs).toBe(periodStart + PERIOD_HOURS * 3600n);
    });

    it('notifies the merchant exactly once', async () => {
        const { rpc } = delegationRpc(SUBSCRIPTION_PDA, periodStart);
        await scheduleOnce(options(rpc));

        const events = await db.select({ eventType: dbSchema.outbox.eventType }).from(dbSchema.outbox);
        expect(events).toEqual([{ eventType: 'charge.failed' }]);
    });

    it('is not repeated on the next cycle', async () => {
        const first = delegationRpc(SUBSCRIPTION_PDA, periodStart);
        await scheduleOnce(options(first.rpc));

        // The row it just wrote is what the SQL filter keys on, so the second
        // cycle does not read the chain again — one attempt per period.
        const second = delegationRpc(SUBSCRIPTION_PDA, periodStart);
        const result = await scheduleOnce(options(second.rpc));

        expect(second.calls.addresses).toHaveLength(0);
        expect(result).toEqual({ charged: 0, failed: 0 });
        expect(await chargeCount()).toBe(1);
        expect(await outboxCount()).toBe(1);
    });
});

describe('candidate selection', () => {
    it('skips a subscription already failed for the period it would charge', async () => {
        await seedFailedCharge(periodStart);
        const { rpc, calls } = failingRpc();

        const result = await scheduleOnce(options(rpc));

        // Filtered out in SQL, before the LIMIT. Previously these were fetched
        // and only then discarded in JS, so a handful of permanently stuck
        // subscriptions filled every batch and starved the chargeable ones.
        expect(calls.reads).toBe(0);
        expect(result).toEqual({ charged: 0, failed: 0 });
    });

    it('skips one already failed for the renewal period it would charge', async () => {
        await seedFailedCharge(periodStart + PERIOD_HOURS * 3600n);
        const { rpc, calls } = failingRpc();

        await scheduleOnce(options(rpc));

        expect(calls.reads).toBe(0);
    });

    it('still considers one whose only failure was for an unrelated period', async () => {
        // The filter has to be narrow: an old failure must not retire a
        // subscription from billing forever.
        await seedFailedCharge(periodStart - 999_999n);
        const { rpc, calls } = failingRpc();

        await scheduleOnce(options(rpc));

        expect(calls.reads).toBeGreaterThan(0);
    });
});
