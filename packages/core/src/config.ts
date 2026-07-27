import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export interface KairosConfig {
    cluster: 'devnet' | 'mainnet-beta';
    rpcUrl: string;
    keysDir: string;
    /** postgres://... or pglite://<dir> (embedded, for local dev). */
    databaseUrl: string;
}

/**
 * Walks upwards from cwd to the workspace root (marked by pnpm-workspace.yaml)
 * so that scripts behave the same whether run from the repo root or from a
 * package directory (pnpm --filter sets cwd to the package).
 */
export function findWorkspaceRoot(from: string = process.cwd()): string {
    let dir = resolve(from);
    while (true) {
        if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return resolve(from); // not in a workspace; fall back to cwd
        dir = parent;
    }
}

/**
 * Reads configuration from the environment (.env at the workspace root).
 *
 * The defaults here are laptop defaults: devnet, the public devnet RPC, and an
 * embedded PGlite directory. Every one of them is the wrong answer for a
 * deployment and none of them fails visibly — an unset SOLANA_RPC_URL points a
 * mainnet worker at devnet and it simply indexes nothing, an unset DATABASE_URL
 * puts billing state in a container directory the next redeploy discards. So
 * they are refused once the environment says this is not a laptop: under
 * NODE_ENV=production, and on mainnet-beta regardless, because a worker that
 * named mainnet has already told us the stakes.
 *
 * The dashboard reaches past this function for the same reason (see
 * apps/web/lib/db.ts): a fallback that cannot work is worse than a named error.
 */
export function loadConfig(): KairosConfig {
    const root = findWorkspaceRoot();
    loadDotenv({ path: join(root, '.env') });

    const isProduction = process.env.NODE_ENV === 'production';
    const rawCluster = process.env.SOLANA_CLUSTER;
    if (!rawCluster && isProduction) {
        throw new Error(
            'SOLANA_CLUSTER must be set explicitly in production (devnet or mainnet-beta): it defaults to devnet, which would run a production worker against the wrong chain.',
        );
    }
    const cluster = rawCluster ?? 'devnet';
    if (cluster !== 'devnet' && cluster !== 'mainnet-beta') {
        throw new Error(`Unsupported SOLANA_CLUSTER: ${cluster}`);
    }

    /** Names why a default is refused, or null while laptop defaults are fine. */
    const strict = cluster === 'mainnet-beta' ? 'mainnet-beta' : isProduction ? 'production' : null;

    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl && strict === 'mainnet-beta') {
        throw new Error(
            'SOLANA_RPC_URL must be set for mainnet-beta: it defaults to the public devnet endpoint, so leaving it unset points a mainnet worker at a chain where none of its accounts exist.',
        );
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl && strict) {
        throw new Error(
            `DATABASE_URL must be set for ${strict}: it defaults to an embedded PGlite directory, which is single-process and does not survive a redeploy. Billing state cannot live there.`,
        );
    }

    const keysDir = process.env.KEYS_DIR ?? '.keys';
    return {
        cluster,
        rpcUrl: rpcUrl ?? 'https://api.devnet.solana.com',
        keysDir: isAbsolute(keysDir) ? keysDir : join(root, keysDir),
        databaseUrl: databaseUrl ?? `pglite://${join(root, '.data', 'kairos-db')}`,
    };
}

/** Solana Explorer link for a transaction signature, respecting the cluster. */
export function explorerTxUrl(signature: string, cluster: KairosConfig['cluster']): string {
    const suffix = cluster === 'devnet' ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
