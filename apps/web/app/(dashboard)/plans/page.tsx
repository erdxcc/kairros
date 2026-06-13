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
import { formatAmount, formatDate, formatPeriod, short } from '@/lib/format';

export default function PlansPage() {
    const plans = usePlans();
    const subs = useSubscriptions();

    const activeByPlan = new Map<string, number>();
    for (const s of subs.data ?? []) {
        if (s.status === 'active') activeByPlan.set(s.planPda, (activeByPlan.get(s.planPda) ?? 0) + 1);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Plans"
                description="Your on-chain subscription plans. Creating plans from the dashboard is on the roadmap; today they are created via the SDK/CLI."
            />

            <Card>
                {plans.isLoading ? (
                    <div className="space-y-2 p-5">
                        {['a', 'b', 'c'].map((k) => (
                            <Skeleton key={k} className="h-9 w-full" />
                        ))}
                    </div>
                ) : plans.isError ? (
                    <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
                ) : plans.data && plans.data.length > 0 ? (
                    <Table>
                        <thead>
                            <tr>
                                <Th>Plan</Th>
                                <Th>Price</Th>
                                <Th>Cadence</Th>
                                <Th className="text-right">Active subs</Th>
                                <Th>Status</Th>
                                <Th>Created</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.data.map((p) => (
                                <Tr key={p.planPda}>
                                    <Td>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-fg">Plan #{p.planId}</span>
                                            <AddressLink value={p.planPda} />
                                        </div>
                                    </Td>
                                    <Td>
                                        <span className="font-mono tabular text-fg">
                                            {formatAmount(p.amount)}
                                        </span>{' '}
                                        <span className="text-faint text-xs">{short(p.mint)}</span>
                                    </Td>
                                    <Td className="text-muted">{formatPeriod(p.periodHours)}</Td>
                                    <Td className="font-mono tabular text-right text-fg">
                                        {activeByPlan.get(p.planPda) ?? 0}
                                    </Td>
                                    <Td>
                                        <StatusBadge status={p.status} />
                                    </Td>
                                    <Td className="text-muted text-xs">{formatDate(p.createdAtChain)}</Td>
                                </Tr>
                            ))}
                        </tbody>
                    </Table>
                ) : (
                    <EmptyState
                        title="No plans yet"
                        hint="Create a plan with the SDK or the demo:lifecycle script; it will appear here once the indexer sees it on-chain."
                    />
                )}
            </Card>
        </div>
    );
}
