/**
 * Records event fixtures from real devnet transactions involving our test
 * actors, and stores both the raw instruction data and the decoded ("golden")
 * form. The vitest suite replays raw bytes through the decoders and compares
 * against the golden output — any upstream wire-format change breaks loudly.
 *
 * Run after `pnpm demo:lifecycle` and `npx tsx scripts/probe-delegations.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Address, address, createSolanaRpc } from '@solana/kit';
import { SUBSCRIPTIONS_PROGRAM_ADDRESS } from '@solana/subscriptions';
import { extractEventsFromTransaction, loadConfig } from '../src/index.js';
import { readDevnetEnv, sleep, stringifySafe, withRetry } from './shared.js';

const config = loadConfig();
const env = readDevnetEnv(config.keysDir);
const rpc = createSolanaRpc(config.rpcUrl);

const FIXTURES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'events.json');

interface FixtureEvent {
    outerIxIndex: number;
    innerIxIndex: number;
    dataBase58: string;
    golden: unknown; // decoded event with bigints stringified
}

interface FixtureTransaction {
    signature: string;
    slot: string;
    blockTime: number | null;
    events: FixtureEvent[];
}

async function signaturesFor(addr: Address): Promise<string[]> {
    const result = await withRetry(() => rpc.getSignaturesForAddress(addr, { limit: 30 }).send(), 6);
    return result.filter((entry) => entry.err === null).map((entry) => entry.signature as string);
}

async function main() {
    // Our actors' signature history is tiny, so this stays well inside rate limits.
    const actorAddresses = [env.merchant, env.subscriber, env.puller].map((a) => address(a));
    const signatures = new Set<string>();
    for (const actor of actorAddresses) {
        for (const signature of await signaturesFor(actor)) {
            signatures.add(signature);
        }
        await sleep(1200);
    }
    console.log(`Scanning ${signatures.size} candidate transactions...`);

    const fixtures: FixtureTransaction[] = [];
    const kindCounts = new Map<string, number>();

    for (const signature of signatures) {
        await sleep(1200); // stay under public devnet rate limits
        const tx = await withRetry(
            () =>
                rpc
                    .getTransaction(signature as Parameters<typeof rpc.getTransaction>[0], {
                        encoding: 'jsonParsed',
                        maxSupportedTransactionVersion: 0,
                    })
                    .send(),
            6,
        );
        if (!tx) continue;

        const extracted = extractEventsFromTransaction(tx, SUBSCRIPTIONS_PROGRAM_ADDRESS);
        if (extracted.length === 0) continue;

        const innerGroups = tx.meta?.innerInstructions ?? [];
        const events: FixtureEvent[] = extracted.map(({ outerIxIndex, innerIxIndex, event }) => {
            const group = innerGroups.find((g) => g.index === outerIxIndex);
            const raw = group?.instructions[innerIxIndex] as { data?: string } | undefined;
            if (!raw?.data) throw new Error(`Missing raw data for event in ${signature}`);
            kindCounts.set(event.kind, (kindCounts.get(event.kind) ?? 0) + 1);
            return {
                outerIxIndex,
                innerIxIndex,
                dataBase58: raw.data,
                golden: JSON.parse(stringifySafe(event)),
            };
        });

        fixtures.push({
            signature,
            slot: String(tx.slot),
            blockTime: tx.blockTime === null ? null : Number(tx.blockTime),
            events,
        });
    }

    fixtures.sort((a, b) => Number(BigInt(a.slot) - BigInt(b.slot)));
    mkdirSync(dirname(FIXTURES_PATH), { recursive: true });
    writeFileSync(FIXTURES_PATH, `${JSON.stringify(fixtures, null, 4)}\n`);

    console.log(`\nWrote ${FIXTURES_PATH}`);
    console.log(`Transactions with events: ${fixtures.length}`);
    for (const [kind, count] of [...kindCounts.entries()].sort()) {
        console.log(`  ${kind}: ${count}`);
    }
    const missing = [
        'subscriptionCreated',
        'subscriptionCancelled',
        'subscriptionResumed',
        'subscriptionTransfer',
        'fixedTransfer',
        'recurringTransfer',
    ].filter((kind) => !kindCounts.has(kind));
    if (missing.length > 0) {
        console.warn(`\n⚠ Missing event kinds: ${missing.join(', ')}`);
        console.warn('Run `pnpm demo:lifecycle` and `npx tsx scripts/probe-delegations.ts` first.');
        process.exit(2);
    }
    console.log('\n✔ All six event kinds covered.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
