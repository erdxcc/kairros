/**
 * Dev-only endpoint registration (the merchant API takes over in Phase 2b):
 * inserts a webhook endpoint row for the local test merchant.
 *
 *   npx tsx scripts/webhook-register.ts [url]
 */
import { randomBytes } from 'node:crypto';
import { createDb, dbSchema, loadConfig } from '../src/index.js';
import { readDevnetEnv } from './shared.js';

const config = loadConfig();
const env = readDevnetEnv(config.keysDir);
const url = process.argv[2] ?? 'http://127.0.0.1:8787/webhook';

async function main() {
    const db = await createDb(config.databaseUrl);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const inserted = await db
        .insert(dbSchema.webhookEndpoints)
        .values({ merchant: env.merchant, url, secret })
        .returning({ id: dbSchema.webhookEndpoints.id });
    console.log(`Registered webhook endpoint #${inserted[0]?.id} for merchant ${env.merchant}`);
    console.log(`  url:    ${url}`);
    console.log(`  secret: ${secret}`);
    console.log('\nRun the receiver with:');
    console.log(`  WEBHOOK_SECRET=${secret} pnpm --filter @kairos/core webhook:receiver`);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
