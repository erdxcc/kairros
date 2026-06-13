/**
 * Read queries over the off-chain projections, always scoped to one merchant
 * (the authenticated wallet = plan owner). These power the dashboard; they
 * never hit RPC, so the dashboard stays fast and the chain stays the source
 * of truth that the indexer/reconciler keep these tables in sync with.
 */
import { type KairosDb, dbSchema } from '@kairos/core';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

const MONTH_HOURS = 730; // ~hours per month, for normalizing any period to MRR

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
