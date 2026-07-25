/**
 * kairos worker entry point: one process, four loops:
 *
 *   indexer     chain events -> projections + outbox    (Phase 1)
 *   scheduler   due subscriptions -> transferSubscription (Phase 2)
 *   dispatcher  outbox -> HMAC-signed merchant webhooks  (Phase 2)
 *   reconciler  on-chain accounts -> projection repair   (Phase 2)
 */
import { join } from 'node:path';
import { PROCESS_ID, createDb, envKeypairPullerSigner, loadConfig } from '@kairos/core';
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
    console.log(`kairos worker, cluster=${config.cluster} rpc=${config.rpcUrl}`);
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

    // Each loop runs only while this process holds its lease, so a second
    // worker is a warm standby rather than a source of duplicate charges and
    // duplicate webhook deliveries. A lease must outlive one cycle by a wide
    // margin: a cycle that overruns its own lease hands the loop to a standby
    // while it is still working.
    const leaseTtl = (cycleMs: number) => Math.max(cycleMs * 4, 60_000);
    const indexerPoll = intEnv('INDEXER_POLL_MS', 8000);
    const schedulerPoll = intEnv('SCHEDULER_POLL_MS', 30000);
    const dispatcherPoll = intEnv('DISPATCHER_POLL_MS', 10000);
    const reconcilerInterval = intEnv('RECONCILER_INTERVAL_MS', 3_600_000);

    console.log(`worker process id ${PROCESS_ID}`);

    await Promise.all([
        runIndexer({
            db,
            rpc,
            stopSignal,
            pollIntervalMs: indexerPoll,
            leaseTtlMs: intEnv('INDEXER_LEASE_TTL_MS', leaseTtl(indexerPoll)),
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
            pollIntervalMs: schedulerPoll,
            leaseTtlMs: intEnv('SCHEDULER_LEASE_TTL_MS', leaseTtl(schedulerPoll)),
        }),
        runDispatcher({
            db,
            stopSignal,
            maxAttempts: intEnv('WEBHOOK_MAX_ATTEMPTS', 5),
            pollIntervalMs: dispatcherPoll,
            leaseTtlMs: intEnv('DISPATCHER_LEASE_TTL_MS', leaseTtl(dispatcherPoll)),
        }),
        runReconciler({
            db,
            rpc,
            stopSignal,
            intervalMs: reconcilerInterval,
            // Not derived from the interval: the loop renews while it waits,
            // so this only sets how long a dead worker's sweep stays parked.
            leaseTtlMs: intEnv('RECONCILER_LEASE_TTL_MS', 900_000),
            planLimit: intEnv('RECONCILER_PLAN_LIMIT', 2000),
            subscriptionLimit: intEnv('RECONCILER_SUBSCRIPTION_LIMIT', 5000),
        }),
    ]);
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
