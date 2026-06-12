/**
 * Database client factory supporting two drivers behind one URL:
 *
 *   - `postgres://...`  — real PostgreSQL via node-postgres (production/self-host)
 *   - `pglite://<dir>`  — embedded PGlite (zero-dependency local dev & tests;
 *                         use `pglite://memory` for an in-memory instance)
 *
 * Migrations from `packages/core/drizzle/` are applied automatically.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type KairosDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

export async function createDb(databaseUrl: string): Promise<KairosDb> {
    if (databaseUrl.startsWith('pglite://')) {
        const target = databaseUrl.slice('pglite://'.length);
        const { PGlite } = await import('@electric-sql/pglite');
        const { drizzle } = await import('drizzle-orm/pglite');
        const { migrate } = await import('drizzle-orm/pglite/migrator');
        const inMemory = target === 'memory' || target === '';
        if (!inMemory) mkdirSync(target, { recursive: true });
        const client = inMemory ? new PGlite() : new PGlite(target);
        const db = drizzle(client, { schema });
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        return db as unknown as KairosDb;
    }

    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return db as unknown as KairosDb;
}
