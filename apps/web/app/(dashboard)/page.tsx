'use client';

import { AddressLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui';
import { type MySubscription, useMySubscriptions, useMySummary } from '@/lib/api';
import { formatAmount, formatDateTime, formatPeriod, short } from '@/lib/format';
import Link from 'next/link';

/**
 * What the wallet is paying for. This is the front page of the dashboard
 * because most wallets that sign in are payers, not merchants.
 */
export default function MySubscriptionsPage() {
    const summary = useMySummary();
    const subs = useMySubscriptions();
    const s = summary.data;

    return (
        <div className="space-y-6">
            <PageHeader
                title="My subscriptions"
                description="What you are paying for, what it costs, and when the next charge is due. Every amount here is capped on-chain and revocable by you."
            />

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                    label="Active"
                    value={s?.activeSubscriptions ?? 0}
                    sub={s?.endingSubscriptions ? `${s.endingSubscriptions} ending soon` : undefined}
                    loading={summary.isLoading}
                />
                <StatCard
                    label="Paid, last 30 days"
                    value={<SpendValue spent={s?.spentLast30d ?? []} />}
                    sub={s && s.spentLast30d.length > 1 ? `across ${s.spentLast30d.length} tokens` : undefined}
                    loading={summary.isLoading}
                />
                <StatCard
                    label="Next charge"
                    value={s?.nextChargeTs ? formatDateTime(s.nextChargeTs) : '—'}
                    sub={s?.nextChargeTs ? undefined : 'nothing due'}
                    loading={summary.isLoading}
                />
            </div>

            {subs.isLoading ? (
                <div className="space-y-3">
                    {['a', 'b'].map((k) => (
                        <Skeleton key={k} className="h-28 w-full" />
                    ))}
                </div>
            ) : subs.isError ? (
                <Card>
                    <ErrorState error={subs.error} onRetry={() => subs.refetch()} />
                </Card>
            ) : subs.data && subs.data.length > 0 ? (
                <ul className="space-y-3">
                    {subs.data.map((sub) => (
                        <li key={sub.subscriptionPda}>
                            <SubscriptionCard subscription={sub} />
                        </li>
                    ))}
                </ul>
            ) : (
                <Card>
                    <EmptyState
                        title="No subscriptions yet"
                        hint="Subscriptions you approve in your wallet show up here, usually within a few seconds of the transaction confirming."
                    />
                </Card>
            )}
        </div>
    );
}

/** Sums are per mint, because adding two different tokens together is a lie. */
function SpendValue({ spent }: { spent: Array<{ mint: string; amount: string }> }) {
    const first = spent[0];
    if (!first) return <>0.00</>;
    return (
        <>
            {formatAmount(first.amount)} <span className="text-faint text-sm">{short(first.mint)}</span>
        </>
    );
}

function SubscriptionCard({ subscription }: { subscription: MySubscription }) {
    const ending = subscription.expiresAtTs !== '0';
    const spentThisPeriod = formatAmount(subscription.amountPulledInPeriod);
    const perPeriod = formatAmount(subscription.amount);

    return (
        <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-faint text-xs uppercase tracking-wider">Merchant</span>
                        <AddressLink value={subscription.merchant} edge={6} />
                    </div>
                    <p className="mt-2 font-mono font-semibold text-fg text-lg tabular">
                        {perPeriod} <span className="text-faint text-xs">{short(subscription.mint)}</span>{' '}
                        <span className="font-sans font-normal text-muted text-sm">
                            {formatPeriod(subscription.periodHours)}
                        </span>
                    </p>
                    {/* A cancellation is a scheduled expiry, not an immediate stop: the
                        period already paid for keeps running, and saying "cancelled"
                        here would read as "your access is gone". */}
                    <p className="mt-1 text-sm">
                        {ending ? (
                            <span className="text-warning">
                                Active until {formatDateTime(subscription.expiresAtTs)}
                            </span>
                        ) : subscription.status === 'active' ? (
                            <span className="text-success">Active</span>
                        ) : (
                            <span className="text-faint">{subscription.status}</span>
                        )}
                    </p>
                </div>

                <div className="text-right">
                    <p className="text-faint text-xs uppercase tracking-wider">Pulled this period</p>
                    <p className="mt-1 font-mono text-fg text-sm tabular">
                        {spentThisPeriod} / {perPeriod}
                    </p>
                    <Link
                        href={`/subscriptions/${encodeURIComponent(subscription.subscriptionPda)}`}
                        className="mt-3 inline-block rounded text-accent text-xs transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                        Manage
                    </Link>
                </div>
            </div>
        </Card>
    );
}
