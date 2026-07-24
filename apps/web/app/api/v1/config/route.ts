import { error, handler, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, merchant-agnostic config the dashboard needs: the billing worker's
 * puller pubkey (which merchants add to their plan's `pullers`) and the active
 * cluster. The puller pubkey is public information; no auth required.
 */
export const GET = handler(async () => {
    // No default: a dashboard that guesses the cluster is a dashboard that
    // shows mainnet balances next to devnet explorer links.
    const cluster = process.env.SOLANA_CLUSTER;
    if (cluster !== 'devnet' && cluster !== 'mainnet-beta') {
        return error(500, 'SOLANA_CLUSTER must be set to devnet or mainnet-beta');
    }
    return json({
        pullerPubkey: process.env.PULLER_PUBKEY ?? null,
        cluster,
    });
});
