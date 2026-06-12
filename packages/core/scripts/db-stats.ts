/** Prints a quick summary of the indexed database (dev tool). */
import { sql } from 'drizzle-orm';
import { createDb, loadConfig } from '../src/index.js';

const config = loadConfig();

async function main() {
    const db = await createDb(config.databaseUrl);
    const q = async (label: string, query: ReturnType<typeof sql>) => {
        // The driver-agnostic KairosDb type erases row typing on raw execute.
        const result = (await db.execute(query)) as unknown as { rows: unknown[] };
        console.log(`\n${label}`);
        for (const row of result.rows) console.log('  ', JSON.stringify(row));
    };

    await q(
        'events by kind:',
        sql`select kind, count(*)::int as n from chain_events group by kind order by kind`,
    );
    await q('plans:', sql`select status, count(*)::int as n from plans group by status`);
    await q(
        'subscriptions by status:',
        sql`select status, count(*)::int as n from subscriptions group by status`,
    );
    await q(
        'charges:',
        sql`select status, count(*)::int as n, sum(amount) as total from charges group by status`,
    );
    await q(
        'outbox:',
        sql`select event_type, count(*)::int as n from outbox group by event_type order by event_type`,
    );
    await q('cursor:', sql`select id, substring(last_signature, 1, 24) as last_sig, updated_at from cursors`);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
