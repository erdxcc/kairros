/**
 * kairos worker entry point — one process, four loops:
 *
 *   indexer     chain events -> projections + outbox    (Phase 1)
 *   scheduler   due subscriptions -> transferSubscription (Phase 2)
 *   dispatcher  outbox -> HMAC-signed merchant webhooks  (Phase 2)
 *   reconciler  on-chain accounts -> projection repair   (Phase 2)
 */
import { join } from 'node:path';
import { createDb, envKeypairPullerSigner, loadConfig } from '@kairos/core';
import { createSolanaRpc } from '@solana/kit';
import { runDispatcher } from './dispatcher.js';
import { runIndexer } from './indexer.js';
import { runReconciler } from './reconciler.js';
import { runScheduler } from './scheduler.js';

const intEnv = (name: string, fallback: number) => {
    const raw = process.env[name];
    const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

async function main() {
    const config = loadConfig();
    console.log(`kairos worker — cluster=${config.cluster} rpc=${config.rpcUrl}`);
    console.log(`database: ${config.databaseUrl.replace(/\/\/.*@/, '//<redacted>@')}`);

    const db = await createDb(config.databaseUrl);
    const rpc = createSolanaRpc(config.rpcUrl);
    const puller = envKeypairPullerSigner(
        process.env.PULLER_KEYPAIR_PATH ?? join(config.keysDir, 'puller.json'),
    );

    const stopSignal = { stopped: false };
    const stop = () => {
        console.log('shutting down after current cycles...');
        stopSignal.stopped = true;
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    await Promise.all([
        runIndexer({
            db,
            rpc,
            stopSignal,
            pollIntervalMs: intEnv('INDEXER_POLL_MS', 8000),
            backfillLimit: intEnv('INDEXER_BACKFILL_LIMIT', 100),
            maxPagesPerPoll: intEnv('INDEXER_MAX_PAGES', 3),
            txDelayMs: intEnv('INDEXER_TX_DELAY_MS', 400),
        }),
        runScheduler({
            db,
            rpc,
            puller,
            rpcUrl: config.rpcUrl,
            stopSignal,
            batchSize: intEnv('SCHEDULER_BATCH', 10),
            pollIntervalMs: intEnv('SCHEDULER_POLL_MS', 30000),
        }),
        runDispatcher({
            db,
            stopSignal,
            maxAttempts: intEnv('WEBHOOK_MAX_ATTEMPTS', 5),
            pollIntervalMs: intEnv('DISPATCHER_POLL_MS', 10000),
        }),
        runReconciler({
            db,
            rpc,
            stopSignal,
            intervalMs: intEnv('RECONCILER_INTERVAL_MS', 3_600_000),
        }),
    ]);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
