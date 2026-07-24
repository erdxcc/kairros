'use client';

import {
    AddressLink,
    Card,
    EmptyState,
    ErrorState,
    PageHeader,
    Skeleton,
    StatusBadge,
    Table,
    Td,
    Th,
    Tr,
} from '@/components/ui';
import { usePlans, useSubscriptions } from '@/lib/api';
import { formatAmount, formatDate, short } from '@/lib/format';
import { useState } from 'react';

export default function SubscribersPage() {
    const [plan, setPlan] = useState<string>('');
    const plans = usePlans();
    const subs = useSubscriptions(plan || undefined);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Subscribers"
                description="Everyone subscribed to your plans, with their on-chain billing status."
                actions={
                    <select
                        value={plan}
                        onChange={(e) => setPlan(e.target.value)}
                        className="h-9 rounded-lg border border-line bg-surface-2 px-3 text-fg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                        <option value="">All plans</option>
                        {(plans.data ?? []).map((p) => (
                            <option key={p.planPda} value={p.planPda}>
                                Plan #{p.planId} · {short(p.planPda)}
                            </option>
                        ))}
                    </select>
                }
            />

            <Card>
                {subs.isLoading ? (
                    <div className="space-y-2 p-5">
                        {['a', 'b', 'c', 'd'].map((k) => (
                            <Skeleton key={k} className="h-9 w-full" />
                        ))}
                    </div>
                ) : subs.isError ? (
                    <ErrorState error={subs.error} onRetry={() => subs.refetch()} />
                ) : subs.data && subs.data.length > 0 ? (
                    <Table>
                        <thead>
                            <tr>
                                <Th>Subscriber</Th>
                                <Th>Plan</Th>
                                <Th>Status</Th>
                                <Th>Started</Th>
                                <Th className="text-right">Pulled this period</Th>
                                <Th>Expires</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {subs.data.map((s) => (
                                <Tr key={s.subscriptionPda}>
                                    <Td>
                                        <AddressLink value={s.subscriber} />
                                    </Td>
                                    <Td>
                                        <AddressLink value={s.planPda} />
                                    </Td>
                                    <Td>
                                        <StatusBadge status={s.status} />
                                    </Td>
                                    <Td className="text-muted text-xs">{formatDate(s.createdTs)}</Td>
                                    <Td className="font-mono tabular text-right text-fg">
                                        {formatAmount(s.amountPulledInPeriod)}
                                    </Td>
                                    <Td className="text-muted text-xs">
                                        {s.status === 'cancelled' && s.expiresAtTs !== '0'
                                            ? formatDate(s.expiresAtTs)
                                            : '—'}
                                    </Td>
                                </Tr>
                            ))}
                        </tbody>
                    </Table>
                ) : (
                    <EmptyState
                        title="No subscribers yet"
                        hint="When someone subscribes to one of your plans, they show up here."
                    />
                )}
            </Card>
        </div>
    );
}
