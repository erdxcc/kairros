/**
 * Database client factory supporting two drivers behind one URL:
 *
 *   - `postgres://...`  — real PostgreSQL via node-postgres. Required for the
 *                         web app (Next.js) and for running the worker and web
 *                         against one shared database.
 *   - `pglite://<dir>`  — embedded PGlite for single-process dev & tests
 *                         (worker, scripts, unit tests). `pglite://memory` is
 *                         in-memory. NOTE: PGlite is single-process and does
 *                         not run inside the Next.js server bundle, so the web
 *                         app always uses a `postgres://` URL.
 *
 * Pass `{ migrate: false }` to connect without applying migrations (the web
 * app does this; schema setup is owned by the worker or `pnpm db:migrate`).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type KairosDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
    /** Apply pending migrations on connect. Default true. */
    migrate?: boolean;
}

export const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

export async function createDb(databaseUrl: string, options: CreateDbOptions = {}): Promise<KairosDb> {
    const shouldMigrate = options.migrate ?? true;

    if (databaseUrl.startsWith('pglite://')) {
        const target = databaseUrl.slice('pglite://'.length);
        const { PGlite } = await import('@electric-sql/pglite');
        const { drizzle } = await import('drizzle-orm/pglite');
        const inMemory = target === 'memory' || target === '';
        if (!inMemory) mkdirSync(target, { recursive: true });
        const client = inMemory ? new PGlite() : new PGlite(target);
        const db = drizzle(client, { schema });
        if (shouldMigrate) {
            const { migrate } = await import('drizzle-orm/pglite/migrator');
            await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        }
        return db as unknown as KairosDb;
    }

    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const db = drizzle(pool, { schema });
    if (shouldMigrate) {
        const { migrate } = await import('drizzle-orm/node-postgres/migrator');
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    }
    return db as unknown as KairosDb;
}
