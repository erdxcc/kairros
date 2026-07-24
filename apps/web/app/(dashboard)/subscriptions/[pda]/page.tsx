'use client';

import { AddressLink, Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useMySubscription } from '@/lib/api';
import { formatAmount, formatDateTime, formatPeriod, short } from '@/lib/format';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * One subscription in full. The API scopes the lookup to the signed-in wallet,
 * so a PDA typed into the URL by hand answers 404 rather than someone else's
 * billing history.
 */
export default function SubscriptionDetailPage() {
    const params = useParams<{ pda: string }>();
    const pda = params?.pda ?? '';
    const query = useMySubscription(pda);
    const sub = query.data;
    const ending = sub ? sub.expiresAtTs !== '0' : false;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/"
                    className="rounded text-faint text-xs transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                    ← My subscriptions
                </Link>
            </div>

            {query.isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-40 w-full" />
                </div>
            ) : query.isError ? (
                <Card>
                    <ErrorState error={query.error} onRetry={() => query.refetch()} />
                </Card>
            ) : sub ? (
                <>
                    <PageHeader
                        title={`${formatAmount(sub.amount)} ${short(sub.mint)} ${formatPeriod(sub.periodHours)}`}
                        description={
                            ending
                                ? `Scheduled to end on ${formatDateTime(sub.expiresAtTs)}. Until then it stays active: you already paid for this period.`
                                : 'Active. The merchant can pull at most the amount above, once per period, and never more.'
                        }
                    />

                    <Card>
                        <CardHeader title="Terms" description="Exactly what this subscription allows." />
                        <div className="space-y-4 p-5">
                            <Field label="Merchant">
                                <AddressLink value={sub.merchant} edge={6} />
                            </Field>
                            <Field label="Amount per period">
                                <span className="font-mono text-fg tabular">
                                    {formatAmount(sub.amount)}{' '}
                                    <span className="text-faint text-xs">{short(sub.mint)}</span>
                                </span>
                            </Field>
                            <Field label="Period">
                                <span className="text-fg">{formatPeriod(sub.periodHours)}</span>
                            </Field>
                            <Field label="Pulled this period">
                                <span className="font-mono text-fg tabular">
                                    {formatAmount(sub.amountPulledInPeriod)} / {formatAmount(sub.amount)}
                                </span>
                            </Field>
                            <Field label="Current period started">
                                <span className="text-fg">{formatDateTime(sub.currentPeriodStartTs)}</span>
                            </Field>
                            <Field label="Subscribed">
                                <span className="text-fg">{formatDateTime(sub.createdTs)}</span>
                            </Field>
                            <Field label="Subscription account">
                                <AddressLink value={sub.subscriptionPda} edge={6} />
                            </Field>
                            <Field label="Plan account">
                                <AddressLink value={sub.planPda} edge={6} />
                            </Field>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader
                            title={ending ? 'Resume' : 'Cancel'}
                            description={
                                ending
                                    ? 'Resuming clears the scheduled expiry and lets billing continue as before.'
                                    : 'Cancelling schedules expiry at the end of the period you already paid for. Nothing is charged after that.'
                            }
                        />
                        <div className="p-5">
                            {/* Both actions are on-chain instructions signed by this
                                wallet, so they wait on browser transaction signing.
                                Until that lands, saying so is better than a button
                                that cannot do what it claims. */}
                            <p className="text-faint text-sm">
                                {ending ? 'Resuming' : 'Cancelling'} from the dashboard needs your wallet to
                                sign a transaction, which is not wired up yet. The on-chain instruction is
                                available today through the kairos scripts.
                            </p>
                        </div>
                    </Card>
                </>
            ) : null}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-44 shrink-0 text-faint text-xs uppercase tracking-wider">{label}</span>
            <div className="text-sm">{children}</div>
        </div>
    );
}
