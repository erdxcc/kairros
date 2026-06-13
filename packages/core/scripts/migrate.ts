/**
 * Applies pending migrations to DATABASE_URL. Use this to set up a fresh
 * Postgres (e.g. Neon, docker-compose, or any postgres:// URL) before
 * starting the worker or web app:
 *
 *   DATABASE_URL=postgres://... pnpm --filter @kairos/core db:migrate
 */
import { createDb, loadConfig } from '../src/index.js';

async function main() {
    const { databaseUrl } = loadConfig();
    console.log(`Applying migrations to ${databaseUrl.replace(/\/\/.*@/, '//<redacted>@')}`);
    await createDb(databaseUrl, { migrate: true });
    console.log('✔ migrations applied');
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
