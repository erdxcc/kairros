/**
 * Read queries over the off-chain projections, scoped to the authenticated
 * wallet as the plan owner (the merchant side of the dashboard). They
 * never hit RPC, so the dashboard stays fast and the chain stays the source
 * of truth that the indexer/reconciler keep these tables in sync with.
 */
import { type KairosDb, dbSchema, subscriptionDue } from '@kairos/core';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

const MONTH_HOURS = 730; // ~hours per month, for normalizing any period to MRR

/**
 * Merchant check behind `requireMerchant`: a wallet is a merchant once it owns
 * a plan. The indexer projects on-chain ownership into `plans.owner`, so this
 * is one indexed lookup and never touches RPC. A wallet that was approved but
 * has not created its first plan yet will come in through the applications
 * table, once that exists.
 */
export async function isMerchant(db: KairosDb, address: string): Promise<boolean> {
    const owned = await db
        .select({ planPda: dbSchema.plans.planPda })
        .from(dbSchema.plans)
        .where(eq(dbSchema.plans.owner, address))
        .limit(1);
    return owned.length > 0;
}

export async function listPlans(db: KairosDb, merchant: string) {
    return db
        .select()
        .from(dbSchema.plans)
        .where(eq(dbSchema.plans.owner, merchant))
        .orderBy(desc(dbSchema.plans.firstSeenAt));
}

export async function listSubscriptions(db: KairosDb, merchant: string, planPda?: string) {
    const where = planPda
        ? and(eq(dbSchema.plans.owner, merchant), eq(dbSchema.subscriptions.planPda, planPda))
        : eq(dbSchema.plans.owner, merchant);
    return db
        .select({
            subscriptionPda: dbSchema.subscriptions.subscriptionPda,
            planPda: dbSchema.subscriptions.planPda,
            subscriber: dbSchema.subscriptions.subscriber,
            mint: dbSchema.subscriptions.mint,
            status: dbSchema.subscriptions.status,
            createdTs: dbSchema.subscriptions.createdTs,
            currentPeriodStartTs: dbSchema.subscriptions.currentPeriodStartTs,
            amountPulledInPeriod: dbSchema.subscriptions.amountPulledInPeriod,
            expiresAtTs: dbSchema.subscriptions.expiresAtTs,
        })
        .from(dbSchema.subscriptions)
        .innerJoin(dbSchema.plans, eq(dbSchema.subscriptions.planPda, dbSchema.plans.planPda))
        .where(where)
        .orderBy(desc(dbSchema.subscriptions.createdTs));
}

export async function listCharges(db: KairosDb, merchant: string, limit = 100) {
    return db
        .select({
            id: dbSchema.charges.id,
            subscriptionPda: dbSchema.charges.subscriptionPda,
            planPda: dbSchema.charges.planPda,
            subscriber: dbSchema.charges.subscriber,
            mint: dbSchema.charges.mint,
            amount: dbSchema.charges.amount,
            receiver: dbSchema.charges.receiver,
            status: dbSchema.charges.status,
            errorCode: dbSchema.charges.errorCode,
            signature: dbSchema.charges.signature,
            executedAt: dbSchema.charges.executedAt,
            createdAt: dbSchema.charges.createdAt,
        })
        .from(dbSchema.charges)
        .innerJoin(dbSchema.plans, eq(dbSchema.charges.planPda, dbSchema.plans.planPda))
        .where(eq(dbSchema.plans.owner, merchant))
        .orderBy(desc(dbSchema.charges.id))
        .limit(limit);
}

// ---- Payer-scoped reads ----
//
// The same projections read the other way round: scoped by
// `subscriptions.subscriber` instead of `plans.owner`. A wallet sees the
// subscriptions it signed and the charges pulled from it, and nothing else.
// The rows carry the plan terms alongside, because a payer wants to know the
// price and the cadence, not a plan PDA.

const paySubscriptionColumns = {
    subscriptionPda: dbSchema.subscriptions.subscriptionPda,
    planPda: dbSchema.subscriptions.planPda,
    subscriber: dbSchema.subscriptions.subscriber,
    mint: dbSchema.subscriptions.mint,
    status: dbSchema.subscriptions.status,
    createdTs: dbSchema.subscriptions.createdTs,
    currentPeriodStartTs: dbSchema.subscriptions.currentPeriodStartTs,
    amountPulledInPeriod: dbSchema.subscriptions.amountPulledInPeriod,
    expiresAtTs: dbSchema.subscriptions.expiresAtTs,
    merchant: dbSchema.plans.owner,
    amount: dbSchema.plans.amount,
    periodHours: dbSchema.plans.periodHours,
    planStatus: dbSchema.plans.status,
    metadataUri: dbSchema.plans.metadataUri,
};

export async function listMySubscriptions(db: KairosDb, subscriber: string) {
    return db
        .select(paySubscriptionColumns)
        .from(dbSchema.subscriptions)
        .innerJoin(dbSchema.plans, eq(dbSchema.subscriptions.planPda, dbSchema.plans.planPda))
        .where(eq(dbSchema.subscriptions.subscriber, subscriber))
        .orderBy(desc(dbSchema.subscriptions.createdTs));
}

/**
 * One subscription, scoped to its payer. The scoping is the point: the PDA
 * comes from the URL, so without it any wallet could read any subscription.
 */
export async function getMySubscription(db: KairosDb, subscriber: string, subscriptionPda: string) {
    const found = await db
        .select(paySubscriptionColumns)
        .from(dbSchema.subscriptions)
        .innerJoin(dbSchema.plans, eq(dbSchema.subscriptions.planPda, dbSchema.plans.planPda))
        .where(
            and(
                eq(dbSchema.subscriptions.subscriber, subscriber),
                eq(dbSchema.subscriptions.subscriptionPda, subscriptionPda),
            ),
        )
        .limit(1);
    return found[0] ?? null;
}

export async function listMyCharges(db: KairosDb, subscriber: string, limit = 100) {
    return db
        .select({
            id: dbSchema.charges.id,
            subscriptionPda: dbSchema.charges.subscriptionPda,
            planPda: dbSchema.charges.planPda,
            merchant: dbSchema.plans.owner,
            mint: dbSchema.charges.mint,
            amount: dbSchema.charges.amount,
            receiver: dbSchema.charges.receiver,
            status: dbSchema.charges.status,
            errorCode: dbSchema.charges.errorCode,
            signature: dbSchema.charges.signature,
            executedAt: dbSchema.charges.executedAt,
            createdAt: dbSchema.charges.createdAt,
        })
        .from(dbSchema.charges)
        .innerJoin(dbSchema.plans, eq(dbSchema.charges.planPda, dbSchema.plans.planPda))
        .where(eq(dbSchema.charges.subscriber, subscriber))
        .orderBy(desc(dbSchema.charges.id))
        .limit(limit);
}

export interface MySummary {
    activeSubscriptions: number;
    /** Scheduled to expire at the end of the paid period (cancelled on-chain). */
    endingSubscriptions: number;
    /** Succeeded charges in the last 30 days, in base units, per mint. */
    spentLast30d: Array<{ mint: string; amount: string }>;
    /** Unix seconds of the earliest upcoming charge, or null when none is due. */
    nextChargeTs: string | null;
}

/**
 * The three numbers a payer opens the dashboard for: what is running, what it
 * cost lately, and when money moves next.
 *
 * `nextChargeTs` is computed in JS from `subscriptionDue`, the same rule the
 * billing scheduler charges by, so the date shown here cannot drift from the
 * date the worker acts on. A payer has a handful of subscriptions, so the loop
 * is cheaper than teaching SQL the period rules twice.
 */
export async function getMySummary(
    db: KairosDb,
    subscriber: string,
    nowTs: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<MySummary> {
    const subs = await listMySubscriptions(db, subscriber);

    let activeSubscriptions = 0;
    let endingSubscriptions = 0;
    let nextChargeTs: bigint | null = null;

    for (const s of subs) {
        // A cancellation schedules expiry at the end of the paid period, so the
        // subscription is still running and still worth showing as such.
        if (s.expiresAtTs !== 0n) {
            endingSubscriptions++;
            continue;
        }
        if (s.status !== 'active') continue;
        activeSubscriptions++;

        const due = subscriptionDue(
            {
                currentPeriodStartTs: s.currentPeriodStartTs,
                amountPulledInPeriod: BigInt(s.amountPulledInPeriod),
                expiresAtTs: s.expiresAtTs,
                amount: BigInt(s.amount),
                periodHours: s.periodHours,
            },
            nowTs,
        );
        const at = due ? nowTs : s.currentPeriodStartTs + s.periodHours * 3600n;
        if (nextChargeTs === null || at < nextChargeTs) nextChargeTs = at;
    }

    const since30d = BigInt(Math.floor(Date.now() / 1000) - 30 * 24 * 3600);
    const spent = await rows<{ mint: string; amount: string }>(
        db,
        sql`
        select c.mint as mint, coalesce(sum(c.amount), 0)::text as amount
        from ${dbSchema.charges} c
        where c.subscriber = ${subscriber} and c.status = 'succeeded'
          and c.executed_at is not null and c.executed_at >= ${since30d}
        group by c.mint order by c.mint
    `,
    );

    return {
        activeSubscriptions,
        endingSubscriptions,
        spentLast30d: spent,
        nextChargeTs: nextChargeTs === null ? null : nextChargeTs.toString(),
    };
}

export interface Metrics {
    mrr: string; // base units, summed across active subscriptions (valid for a single mint)
    mints: string[]; // distinct mints among active subscriptions
    activeSubscribers: number;
    canceledLast30d: number;
    churnRate: number; // canceled / (active + canceled)
    revenueLast30d: string; // base units of succeeded charges in the last 30 days
    revenueSeries: Array<{ day: string; amount: string }>; // last 30 days, succeeded charges
}

/** The driver-agnostic KairosDb type erases row typing on raw execute(). */
async function rows<T>(db: KairosDb, query: ReturnType<typeof sql>): Promise<T[]> {
    const result = (await db.execute(query)) as unknown as { rows: T[] };
    return result.rows;
}

export async function getMetrics(db: KairosDb, merchant: string): Promise<Metrics> {
    const since30d = BigInt(Math.floor(Date.now() / 1000) - 30 * 24 * 3600);

    const activeRows = await rows<{ mrr: string; active_subscribers: number; mints: string[] }>(
        db,
        sql`
        select
            round(coalesce(sum((p.amount * ${MONTH_HOURS}) / nullif(p.period_hours, 0)), 0))::text as mrr,
            count(*)::int as active_subscribers,
            coalesce(array_agg(distinct s.mint), '{}') as mints
        from ${dbSchema.subscriptions} s
        join ${dbSchema.plans} p on s.plan_pda = p.plan_pda
        where p.owner = ${merchant} and s.status = 'active'
    `,
    );

    const canceledRows = await rows<{ canceled_30d: number }>(
        db,
        sql`
        select count(*)::int as canceled_30d
        from ${dbSchema.subscriptions} s
        join ${dbSchema.plans} p on s.plan_pda = p.plan_pda
        where p.owner = ${merchant} and s.status = 'cancelled'
          and s.updated_at >= now() - interval '30 days'
    `,
    );

    const revenueRows = await rows<{ revenue_30d: string }>(
        db,
        sql`
        select coalesce(sum(c.amount), 0)::text as revenue_30d
        from ${dbSchema.charges} c
        join ${dbSchema.plans} p on c.plan_pda = p.plan_pda
        where p.owner = ${merchant} and c.status = 'succeeded'
          and c.executed_at is not null and c.executed_at >= ${since30d}
    `,
    );

    const seriesRows = await rows<{ day: string; amount: string }>(
        db,
        sql`
        select to_char(to_timestamp(c.executed_at), 'YYYY-MM-DD') as day,
               coalesce(sum(c.amount), 0)::text as amount
        from ${dbSchema.charges} c
        join ${dbSchema.plans} p on c.plan_pda = p.plan_pda
        where p.owner = ${merchant} and c.status = 'succeeded'
          and c.executed_at is not null and c.executed_at >= ${since30d}
        group by day order by day
    `,
    );

    const activeRow = activeRows[0] ?? { mrr: '0', active_subscribers: 0, mints: [] };
    const canceledCount = canceledRows[0]?.canceled_30d ?? 0;
    const activeCount = activeRow.active_subscribers;
    const churnDenom = activeCount + canceledCount;

    return {
        mrr: activeRow.mrr ?? '0',
        mints: (activeRow.mints ?? []).filter(Boolean),
        activeSubscribers: activeCount,
        canceledLast30d: canceledCount,
        churnRate: churnDenom === 0 ? 0 : canceledCount / churnDenom,
        revenueLast30d: revenueRows[0]?.revenue_30d ?? '0',
        revenueSeries: seriesRows.map((r) => ({ day: r.day, amount: r.amount })),
    };
}
