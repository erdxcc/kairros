'use client';

import { RevenueChart } from '@/components/revenue-chart';
import {
    AddressLink,
    Card,
    CardHeader,
    EmptyState,
    ErrorState,
    Skeleton,
    StatCard,
    StatusBadge,
    Table,
    Td,
    Th,
    Tr,
} from '@/components/ui';
import { type MintAmount, useCharges, useMetrics } from '@/lib/api';
import { formatAmount, formatPercent, relativeTime, short } from '@/lib/format';
import Link from 'next/link';

/**
 * Renders a per-mint total. One mint reads exactly as a single figure always
 * did; several are stacked and labelled rather than added together, because a
 * sum across mints with different decimals is not a smaller truth, it is a
 * number that means nothing.
 */
function MintTotals({ rows }: { rows: MintAmount[] | undefined }) {
    if (!rows || rows.length === 0) return <>—</>;
    const [only] = rows;
    if (rows.length === 1 && only) return <>{formatAmount(only.amount)}</>;
    return (
        <span className="flex flex-col gap-0.5">
            {rows.map((row) => (
                <span key={row.mint} className="flex items-baseline gap-2">
                    <span>{formatAmount(row.amount)}</span>
                    <span className="font-normal font-sans text-faint text-xs">{short(row.mint)}</span>
                </span>
            ))}
        </span>
    );
}

function mintSub(rows: MintAmount[] | undefined): string {
    if (!rows || rows.length === 0) return '—';
    const [only] = rows;
    if (rows.length === 1 && only) return short(only.mint);
    return `${rows.length} tokens, kept separate`;
}

export default function OverviewPage() {
    const metrics = useMetrics();
    const charges = useCharges(6);

    const m = metrics.data;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-semibold text-fg text-xl tracking-tight">Overview</h1>
                <p className="mt-1 text-muted text-sm">
                    Recurring revenue and subscription health, projected live from on-chain activity.
                </p>
            </div>

            {metrics.isError ? (
                <Card>
                    <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="MRR"
                        loading={metrics.isLoading}
                        value={<MintTotals rows={m?.mrrByMint} />}
                        sub={mintSub(m?.mrrByMint)}
                    />
                    <StatCard
                        label="Active subscribers"
                        loading={metrics.isLoading}
                        value={m?.activeSubscribers ?? 0}
                        sub="currently active"
                    />
                    <StatCard
                        label="Churn · 30d"
                        loading={metrics.isLoading}
                        value={m ? formatPercent(m.churnRate) : '—'}
                        sub={m ? `${m.canceledLast30d} canceled` : undefined}
                    />
                    <StatCard
                        label="Revenue · 30d"
                        loading={metrics.isLoading}
                        value={<MintTotals rows={m?.revenueLast30dByMint} />}
                        sub={mintSub(m?.revenueLast30dByMint)}
                    />
                </div>
            )}

            <Card>
                <CardHeader
                    title="Revenue"
                    description={
                        // Naming the mint matters once there is more than one:
                        // the line is that mint's charges, not every mint's.
                        m?.revenueSeriesMint
                            ? `Successful charges in ${short(m.revenueSeriesMint)}, last 30 days`
                            : 'Successful charges, last 30 days'
                    }
                />
                {metrics.isLoading ? (
                    <div className="p-5">
                        <Skeleton className="h-44 w-full" />
                    </div>
                ) : m ? (
                    <RevenueChart series={m.revenueSeries} />
                ) : null}
            </Card>

            <Card>
                <CardHeader
                    title="Recent payments"
                    action={
                        <Link href="/merchant/payments" className="text-accent text-xs hover:underline">
                            View all
                        </Link>
                    }
                />
                {charges.isLoading ? (
                    <div className="space-y-2 p-5">
                        {['a', 'b', 'c'].map((k) => (
                            <Skeleton key={k} className="h-8 w-full" />
                        ))}
                    </div>
                ) : charges.isError ? (
                    <ErrorState error={charges.error} onRetry={() => charges.refetch()} />
                ) : charges.data && charges.data.length > 0 ? (
                    <Table>
                        <thead>
                            <tr>
                                <Th>Subscriber</Th>
                                <Th>Amount</Th>
                                <Th>Status</Th>
                                <Th className="text-right">When</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {charges.data.map((c) => (
                                <Tr key={c.id}>
                                    <Td>
                                        <AddressLink value={c.subscriber} />
                                    </Td>
                                    <Td className="font-mono tabular text-fg">{formatAmount(c.amount)}</Td>
                                    <Td>
                                        <StatusBadge status={c.status} />
                                    </Td>
                                    <Td className="text-right text-muted text-xs">
                                        {relativeTime(c.executedAt ?? c.createdAt)}
                                    </Td>
                                </Tr>
                            ))}
                        </tbody>
                    </Table>
                ) : (
                    <EmptyState
                        title="No payments yet"
                        hint="Charges appear here once the billing scheduler pulls a due subscription."
                    />
                )}
            </Card>
        </div>
    );
}
