/**
 * Creates a plan and subscribes WITHOUT charging — the point is to watch the
 * kairos worker pick the subscription up and charge it automatically.
 *
 *   npx tsx scripts/demo-subscribe.ts
 */
import { join } from 'node:path';
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { findPlanPda, findSubscriptionAuthorityPda, subscriptionsProgram } from '@solana/subscriptions';
import { explorerTxUrl, loadConfig } from '../src/index.js';
import {
    describeError,
    extractSignature,
    loadKeypairSigner,
    readDevnetEnv,
    sleep,
    withRetry,
} from './shared.js';

const PLAN_AMOUNT = 5_000_000n; // 5 devUSDC
const PERIOD_HOURS = 1;

const config = loadConfig();
const env = readDevnetEnv(config.keysDir);

async function main() {
    const merchantKp = await loadKeypairSigner(join(config.keysDir, 'merchant.json'));
    const subscriberKp = await loadKeypairSigner(join(config.keysDir, 'subscriber.json'));
    const pullerKp = await loadKeypairSigner(join(config.keysDir, 'puller.json'));

    const makeClient = (kp: typeof merchantKp) =>
        createClient()
            .use(signer(kp))
            .use(solanaRpc({ rpcUrl: config.rpcUrl }))
            .use(subscriptionsProgram());

    const merchant = makeClient(merchantKp);
    const subscriber = makeClient(subscriberKp);

    const mint = env.mint as Parameters<typeof findAssociatedTokenPda>[0]['mint'];
    const planId = BigInt(Date.now());

    const created = await withRetry(() =>
        merchant.subscriptions.instructions
            .createPlan({
                planId,
                mint,
                amount: PLAN_AMOUNT,
                periodHours: PERIOD_HOURS,
                endTs: 0,
                destinations: [merchantKp.address],
                pullers: [pullerKp.address], // authorize the kairos billing key
                metadataUri: '',
            })
            .sendTransaction(),
    );
    const [planPda] = await findPlanPda({ owner: merchantKp.address, planId });
    console.log(`createPlan: ${extractSignature(created)}`);
    console.log(`planPda ${planPda} — pullers include the kairos billing key ${pullerKp.address}`);

    // Make sure the authority exists (idempotent across runs).
    const [authorityPda] = await findSubscriptionAuthorityPda({
        user: subscriberKp.address,
        tokenMint: mint,
    });
    const { value: authority } = await subscriber.rpc
        .getAccountInfo(authorityPda, { encoding: 'base64' })
        .send();
    if (!authority) {
        const [subscriberAta] = await findAssociatedTokenPda({
            owner: subscriberKp.address,
            mint,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });
        const init = await withRetry(() =>
            subscriber.subscriptions.instructions
                .initSubscriptionAuthority({
                    tokenMint: mint,
                    userAta: subscriberAta,
                    tokenProgram: TOKEN_PROGRAM_ADDRESS,
                })
                .sendTransaction(),
        );
        console.log(`initSubscriptionAuthority: ${extractSignature(init)}`);
    }

    await sleep(1500);
    const subscribed = await withRetry(() =>
        subscriber.subscriptions.instructions
            .subscribe({ merchant: merchantKp.address, planId, tokenMint: mint })
            .sendTransaction(),
    );
    const signature = extractSignature(subscribed);
    console.log(`subscribe: ${signature}`);
    console.log(`  ${explorerTxUrl(signature, config.cluster)}`);
    console.log('\n✔ Subscription is live and UNCHARGED.');
    console.log('Start the worker and watch the scheduler charge it automatically:');
    console.log('  pnpm worker:dev');
}

main().catch((error) => {
    console.error(describeError(error));
    process.exit(1);
});
