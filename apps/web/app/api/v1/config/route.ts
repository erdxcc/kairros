import { handler, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, merchant-agnostic config the dashboard needs: the billing worker's
 * puller pubkey (which merchants add to their plan's `pullers`) and the active
 * cluster. The puller pubkey is public information; no auth required.
 */
export const GET = handler(async () => {
    return json({
        pullerPubkey: process.env.PULLER_PUBKEY ?? null,
        cluster: process.env.SOLANA_CLUSTER ?? 'devnet',
    });
});
