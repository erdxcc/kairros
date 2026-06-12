/**
 * kairos worker entry point. Phase 1 runs the event indexer; the billing
 * scheduler and webhook dispatcher join in Phase 2.
 */
import { createDb, loadConfig } from '@kairos/core';
import { createSolanaRpc } from '@solana/kit';
import { runIndexer } from './indexer.js';

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

    const stopSignal = { stopped: false };
    const stop = () => {
        console.log('shutting down after the current poll...');
        stopSignal.stopped = true;
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    await runIndexer({
        db,
        rpc,
        stopSignal,
        pollIntervalMs: intEnv('INDEXER_POLL_MS', 8000),
        backfillLimit: intEnv('INDEXER_BACKFILL_LIMIT', 100),
        maxPagesPerPoll: intEnv('INDEXER_MAX_PAGES', 3),
        txDelayMs: intEnv('INDEXER_TX_DELAY_MS', 400),
    });
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
