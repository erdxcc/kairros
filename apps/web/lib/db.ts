import { type KairosDb, createDb } from '@kairos/core';

// Lazy singleton: the DB connects on first request, never at module load /
// build time (Next collects route metadata at build, which must not touch IO).
let dbPromise: Promise<KairosDb> | undefined;

/**
 * The dashboard's database URL.
 *
 * Read straight from the environment rather than through `loadConfig()`, which
 * falls back to an embedded PGlite path when DATABASE_URL is unset. That
 * fallback is right for the worker and the scripts and wrong here: PGlite is
 * single-process and does not run inside the Next.js server bundle, so the
 * fallback cannot work — it can only turn a missing variable into a confusing
 * failure somewhere further in. Every other deployment input this app needs
 * (AUTH_SECRET, NEXT_PUBLIC_SOLANA_CLUSTER) fails by name; this one now does too.
 */
function databaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            'DATABASE_URL must be set for the dashboard: it needs a postgres:// database shared with the worker. ' +
                'PGlite is single-process and cannot serve the Next.js runtime. See .env.example.',
        );
    }
    if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
        throw new Error(
            `DATABASE_URL must be a postgres:// URL for the dashboard (got ${url.split(':')[0]}://). PGlite is single-process and cannot serve the Next.js runtime. See .env.example.`,
        );
    }
    return url;
}

export function getDb(): Promise<KairosDb> {
    if (!dbPromise) {
        // The web app connects only: schema setup is owned by `pnpm db:migrate`
        // or the worker.
        dbPromise = createDb(databaseUrl(), { migrate: false }).catch((error) => {
            // Do not cache a rejection: a pool that failed to come up once
            // would otherwise keep failing for the life of the process, long
            // after whatever broke it was fixed.
            dbPromise = undefined;
            throw error;
        });
    }
    return dbPromise;
}
