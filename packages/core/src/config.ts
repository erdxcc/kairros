import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export interface KairosConfig {
    cluster: 'devnet' | 'mainnet-beta';
    rpcUrl: string;
    keysDir: string;
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

/** Reads configuration from the environment (.env at the workspace root). */
export function loadConfig(): KairosConfig {
    const root = findWorkspaceRoot();
    loadDotenv({ path: join(root, '.env') });

    const cluster = process.env.SOLANA_CLUSTER ?? 'devnet';
    if (cluster !== 'devnet' && cluster !== 'mainnet-beta') {
        throw new Error(`Unsupported SOLANA_CLUSTER: ${cluster}`);
    }
    const keysDir = process.env.KEYS_DIR ?? '.keys';
    return {
        cluster,
        rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
        keysDir: isAbsolute(keysDir) ? keysDir : join(root, keysDir),
    };
}

/** Solana Explorer link for a transaction signature, respecting the cluster. */
export function explorerTxUrl(signature: string, cluster: KairosConfig['cluster']): string {
    const suffix = cluster === 'devnet' ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
