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
import { useCharges } from '@/lib/api';
import { formatAmount, formatDateTime, short } from '@/lib/format';

export default function PaymentsPage() {
    const charges = useCharges(200);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Payments"
                description="Every charge attempt: successful on-chain transfers and failed pulls recorded by the billing worker."
            />

            <Card>
                {charges.isLoading ? (
                    <div className="space-y-2 p-5">
                        {['a', 'b', 'c', 'd', 'e'].map((k) => (
                            <Skeleton key={k} className="h-9 w-full" />
                        ))}
                    </div>
                ) : charges.isError ? (
                    <ErrorState error={charges.error} onRetry={() => charges.refetch()} />
                ) : charges.data && charges.data.length > 0 ? (
                    <Table>
                        <thead>
                            <tr>
                                <Th>Date</Th>
                                <Th>Subscriber</Th>
                                <Th className="text-right">Amount</Th>
                                <Th>Status</Th>
                                <Th>Detail</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {charges.data.map((c) => (
                                <Tr key={c.id}>
                                    <Td className="text-muted text-xs">
                                        {formatDateTime(c.executedAt ?? c.createdAt)}
                                    </Td>
                                    <Td>
                                        <AddressLink value={c.subscriber} />
                                    </Td>
                                    <Td className="tabular text-right text-fg">
                                        {formatAmount(c.amount)}{' '}
                                        <span className="text-faint text-xs">{short(c.mint)}</span>
                                    </Td>
                                    <Td>
                                        <StatusBadge status={c.status} />
                                    </Td>
                                    <Td>
                                        {c.status === 'succeeded' && c.signature ? (
                                            <AddressLink value={c.signature} kind="tx" edge={6} />
                                        ) : c.errorCode ? (
                                            <span className="font-mono text-danger text-xs">
                                                {c.errorCode}
                                            </span>
                                        ) : (
                                            <span className="text-faint">—</span>
                                        )}
                                    </Td>
                                </Tr>
                            ))}
                        </tbody>
                    </Table>
                ) : (
                    <EmptyState
                        title="No payments yet"
                        hint="Charges appear once the billing scheduler pulls a due subscription via the puller key."
                    />
                )}
            </Card>
        </div>
    );
}
