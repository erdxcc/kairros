/**
 * Spike probe: what exactly happens when a charge exceeds the subscriber's
 * token balance? Dunning needs to distinguish "insufficient funds" (retryable)
 * from terminal failures, so we capture the precise error shape here.
 *
 * Creates a plan priced above the subscriber's balance, subscribes, then
 * attempts the charge. Expected: failure inside the SPL Token CPI, not a
 * Subscriptions custom error.
 */
import { join } from 'node:path';
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { findPlanPda, findSubscriptionDelegationPda, subscriptionsProgram } from '@solana/subscriptions';
import { loadConfig } from '../src/index.js';
import {
    describeError,
    extractSignature,
    loadKeypairSigner,
    readDevnetEnv,
    sleep,
    withRetry,
} from './shared.js';

const PLAN_AMOUNT = 2_000_000_000n; // 2,000 devUSDC — far above the subscriber's balance

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
    const puller = makeClient(pullerKp);

    const mint = env.mint as Parameters<typeof findAssociatedTokenPda>[0]['mint'];
    const [merchantAta] = await findAssociatedTokenPda({
        owner: merchantKp.address,
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const planId = BigInt(Date.now());
    const created = await withRetry(() =>
        merchant.subscriptions.instructions
            .createPlan({
                planId,
                mint,
                amount: PLAN_AMOUNT,
                periodHours: 1,
                endTs: 0,
                destinations: [merchantKp.address],
                pullers: [pullerKp.address],
                metadataUri: '',
            })
            .sendTransaction(),
    );
    console.log(`createPlan (2,000 devUSDC/hour): ${extractSignature(created)}`);

    await sleep(1500);
    const subscribed = await withRetry(() =>
        subscriber.subscriptions.instructions
            .subscribe({ merchant: merchantKp.address, planId, tokenMint: mint })
            .sendTransaction(),
    );
    console.log(`subscribe: ${extractSignature(subscribed)}`);

    const [planPda] = await findPlanPda({ owner: merchantKp.address, planId });
    const [subscriptionPda] = await findSubscriptionDelegationPda({
        planPda,
        subscriber: subscriberKp.address,
    });

    await sleep(1500);
    console.log('\nAttempting charge above subscriber balance...');
    try {
        await withRetry(() =>
            puller.subscriptions.instructions
                .transferSubscription({
                    amount: PLAN_AMOUNT,
                    delegator: subscriberKp.address,
                    planPda,
                    subscriptionPda,
                    receiverAta: merchantAta,
                    tokenMint: mint,
                    tokenProgram: TOKEN_PROGRAM_ADDRESS,
                })
                .sendTransaction(),
        );
        console.log('UNEXPECTED: charge above balance succeeded');
    } catch (error) {
        console.log(`Failed as expected. Full error shape:\n${describeError(error)}`);
    }
}

main().catch((error) => {
    console.error(describeError(error));
    process.exit(1);
});
