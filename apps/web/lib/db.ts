import { type KairosDb, createDb, loadConfig } from '@kairos/core';

// Lazy singleton: the DB connects on first request, never at module load /
// build time (Next collects route metadata at build, which must not touch IO).
let dbPromise: Promise<KairosDb> | undefined;

export function getDb(): Promise<KairosDb> {
    if (!dbPromise) {
        // The web app connects only — schema setup is owned by `pnpm db:migrate`
        // or the worker. The web app requires a postgres:// URL (PGlite is
        // single-process and does not run inside the Next.js server bundle).
        dbPromise = createDb(loadConfig().databaseUrl, { migrate: false });
    }
    return dbPromise;
}
