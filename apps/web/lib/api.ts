/**
 * Typed client for the merchant REST API. All amounts/timestamps arrive as
 * strings (u64-safe). Every request carries the session bearer token; a 401
 * clears the session so the app falls back to the sign-in screen.
 */
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearSession, readSession } from './session';

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const session = readSession();
    const res = await fetch(`/api/v1${path}`, {
        ...init,
        headers: {
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
            ...(session ? { authorization: `Bearer ${session.token}` } : {}),
            ...init?.headers,
        },
    });
    if (res.status === 401) {
        clearSession();
        throw new ApiError(401, 'unauthorized');
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, body?.error ?? res.statusText);
    return body as T;
}

// ---- Response shapes (mirror the server projections) ----

export interface Plan {
    planPda: string;
    owner: string;
    planId: string;
    mint: string;
    amount: string;
    periodHours: string;
    status: string;
    endTs: string;
    destinations: string[];
    pullers: string[];
    metadataUri: string;
    createdAtChain: string;
    firstSeenAt: string;
    updatedAt: string;
}

export interface Subscription {
    subscriptionPda: string;
    planPda: string;
    subscriber: string;
    mint: string;
    status: string;
    createdTs: string;
    currentPeriodStartTs: string;
    amountPulledInPeriod: string;
    expiresAtTs: string;
}

export interface Charge {
    id: number;
    subscriptionPda: string;
    planPda: string;
    subscriber: string;
    mint: string;
    amount: string;
    receiver: string | null;
    status: string;
    errorCode: string | null;
    signature: string | null;
    executedAt: string | null;
    createdAt: string;
}

export interface Metrics {
    mrr: string;
    mints: string[];
    activeSubscribers: number;
    canceledLast30d: number;
    churnRate: number;
    revenueLast30d: string;
    revenueSeries: Array<{ day: string; amount: string }>;
}

export interface WebhookEndpoint {
    id: number;
    url: string;
    active: boolean;
    createdAt: string;
}

export interface AppConfig {
    pullerPubkey: string | null;
    cluster: string;
}

// ---- Auth (public endpoints, no bearer required) ----

export interface NonceResponse {
    message: string;
    nonceToken: string;
}

export function requestNonce(address: string): Promise<NonceResponse> {
    return apiFetch<NonceResponse>('/auth/nonce', {
        method: 'POST',
        body: JSON.stringify({ address }),
    });
}

export function verifySignature(input: {
    address: string;
    message: string;
    signature: string;
    nonceToken: string;
}): Promise<{ token: string; merchant: string }> {
    return apiFetch('/auth/verify', { method: 'POST', body: JSON.stringify(input) });
}

// ---- Query hooks ----

export function usePlans(): UseQueryResult<Plan[]> {
    return useQuery({
        queryKey: ['plans'],
        queryFn: () => apiFetch<{ plans: Plan[] }>('/plans').then((r) => r.plans),
    });
}

export function useSubscriptions(planPda?: string): UseQueryResult<Subscription[]> {
    const qs = planPda ? `?plan=${encodeURIComponent(planPda)}` : '';
    return useQuery({
        queryKey: ['subscriptions', planPda ?? null],
        queryFn: () =>
            apiFetch<{ subscriptions: Subscription[] }>(`/subscriptions${qs}`).then((r) => r.subscriptions),
    });
}

export function useCharges(limit = 100): UseQueryResult<Charge[]> {
    return useQuery({
        queryKey: ['charges', limit],
        queryFn: () => apiFetch<{ charges: Charge[] }>(`/charges?limit=${limit}`).then((r) => r.charges),
    });
}

export function useMetrics(): UseQueryResult<Metrics> {
    return useQuery({
        queryKey: ['metrics'],
        queryFn: () => apiFetch<{ metrics: Metrics }>('/metrics').then((r) => r.metrics),
    });
}

export function useConfig(): UseQueryResult<AppConfig> {
    return useQuery({
        queryKey: ['config'],
        queryFn: () => apiFetch<AppConfig>('/config'),
        staleTime: Number.POSITIVE_INFINITY,
    });
}

export function useWebhookEndpoints(): UseQueryResult<WebhookEndpoint[]> {
    return useQuery({
        queryKey: ['webhook-endpoints'],
        queryFn: () =>
            apiFetch<{ endpoints: WebhookEndpoint[] }>('/webhook-endpoints').then((r) => r.endpoints),
    });
}

export function useCreateWebhook() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (url: string) =>
            apiFetch<{ id: number; url: string; secret: string }>('/webhook-endpoints', {
                method: 'POST',
                body: JSON.stringify({ url }),
            }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-endpoints'] }),
    });
}

export function useDeleteWebhook() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) =>
            apiFetch<{ id: number }>(`/webhook-endpoints?id=${id}`, { method: 'DELETE' }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-endpoints'] }),
    });
}
