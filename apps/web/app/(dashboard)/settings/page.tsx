'use client';

import {
    AddressLink,
    Button,
    Card,
    CardHeader,
    CopyButton,
    EmptyState,
    ErrorState,
    Skeleton,
    cn,
} from '@/components/ui';
import { useConfig, useCreateWebhook, useDeleteWebhook, useWebhookEndpoints } from '@/lib/api';
import { useAuth } from '@/lib/auth-client';
import { formatDate, short } from '@/lib/format';
import { useState } from 'react';

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="font-semibold text-fg text-xl tracking-tight">Settings</h1>
                <p className="mt-1 text-muted text-sm">Billing key and webhook delivery.</p>
            </div>
            <BillingKeyCard />
            <WebhooksCard />
        </div>
    );
}

function BillingKeyCard() {
    const { session } = useAuth();
    const config = useConfig();

    return (
        <Card>
            <CardHeader
                title="Billing key"
                description="Add this key to your plan's pullers so kairos can pull due charges. It can never redirect funds — destinations are immutable on-chain."
            />
            <div className="space-y-4 p-5">
                <Field label="Merchant (you)">
                    <AddressLink value={session?.merchant} edge={6} />
                </Field>
                <Field label="Puller pubkey">
                    {config.isLoading ? (
                        <Skeleton className="h-5 w-48" />
                    ) : config.data?.pullerPubkey ? (
                        <AddressLink value={config.data.pullerPubkey} edge={6} />
                    ) : (
                        <span className="text-faint text-xs">
                            Not configured. Set <code className="text-muted">PULLER_PUBKEY</code> in the web
                            app environment to display it here.
                        </span>
                    )}
                </Field>
            </div>
        </Card>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-40 shrink-0 text-faint text-xs uppercase tracking-wider">{label}</span>
            <div className="text-sm">{children}</div>
        </div>
    );
}

function WebhooksCard() {
    const endpoints = useWebhookEndpoints();
    const create = useCreateWebhook();
    const remove = useDeleteWebhook();
    const [url, setUrl] = useState('');
    const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        try {
            const created = await create.mutateAsync(url.trim());
            setNewSecret({ url: created.url, secret: created.secret });
            setUrl('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add endpoint');
        }
    }

    return (
        <Card>
            <CardHeader
                title="Webhooks"
                description="HMAC-signed events (charge.succeeded, subscription.cancelled, …) delivered to your backend."
            />

            <form onSubmit={submit} className="flex flex-col gap-2 border-line-soft border-b p-5 sm:flex-row">
                <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-app.com/webhooks/kairos"
                    className="h-9 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-fg text-sm placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                />
                <Button type="submit" variant="primary" disabled={create.isPending || url.trim() === ''}>
                    {create.isPending ? 'Adding…' : 'Add endpoint'}
                </Button>
            </form>

            {newSecret ? (
                <div className="border-line-soft border-b bg-accent-soft/40 p-5">
                    <p className="font-medium text-fg text-sm">Signing secret — copy it now</p>
                    <p className="mt-0.5 text-faint text-xs">
                        Shown only once. Use it to verify the HMAC signature on {short(newSecret.url, 8)}.
                    </p>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                        <code className="flex-1 truncate font-mono text-fg text-xs">{newSecret.secret}</code>
                        <CopyButton value={newSecret.secret} label="Copy secret" />
                    </div>
                </div>
            ) : null}

            {error ? <p className="px-5 pt-3 text-danger text-xs">{error}</p> : null}

            {endpoints.isLoading ? (
                <div className="space-y-2 p-5">
                    {['a', 'b'].map((k) => (
                        <Skeleton key={k} className="h-9 w-full" />
                    ))}
                </div>
            ) : endpoints.isError ? (
                <ErrorState error={endpoints.error} onRetry={() => endpoints.refetch()} />
            ) : endpoints.data && endpoints.data.length > 0 ? (
                <ul className="divide-y divide-line-soft">
                    {endpoints.data.map((ep) => (
                        <li key={ep.id} className="flex items-center justify-between gap-4 px-5 py-3">
                            <div className="min-w-0">
                                <p
                                    className={cn(
                                        'truncate text-sm',
                                        ep.active ? 'text-fg' : 'text-faint line-through',
                                    )}
                                >
                                    {ep.url}
                                </p>
                                <p className="text-faint text-xs">Added {formatDate(ep.createdAt)}</p>
                            </div>
                            {ep.active ? (
                                <Button
                                    size="sm"
                                    variant="danger"
                                    disabled={remove.isPending}
                                    onClick={() => remove.mutate(ep.id)}
                                >
                                    Deactivate
                                </Button>
                            ) : (
                                <span className="text-faint text-xs">inactive</span>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <EmptyState
                    title="No webhook endpoints"
                    hint="Add an HTTPS endpoint to receive signed events."
                />
            )}
        </Card>
    );
}
