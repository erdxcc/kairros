/**
 * End-to-end lifecycle smoke test against the live Subscriptions program on
 * devnet. Exercises the exact flow kairos automates for merchants:
 *
 *   1. merchant   createPlan           (5 devUSDC / 1 hour period, puller allowed)
 *   2. subscriber initSubscriptionAuthority   (once per user+mint)
 *   3. subscriber subscribe
 *   4. puller     transferSubscription (the service billing key pulls a charge)
 *   5. puller     transferSubscription again — expected to FAIL (period amount cap, error 400)
 *   6. subscriber cancelSubscription   (grace-period semantics probe)
 *   7. subscriber resumeSubscription
 *
 * Prints every signature with an explorer link. Run `pnpm setup:devnet` first.
 */
import { join } from 'node:path';
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import {
    fetchPlan,
    fetchSubscriptionDelegation,
    findPlanPda,
    findSubscriptionAuthorityPda,
    findSubscriptionDelegationPda,
    subscriptionsProgram,
} from '@solana/subscriptions';
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

function logStep(title: string) {
    console.log(`\n=== ${title} ${'='.repeat(Math.max(0, 60 - title.length))}`);
}

function logTx(label: string, result: unknown) {
    const signature = extractSignature(result);
    console.log(`${label}: ${signature}`);
    console.log(`  ${explorerTxUrl(signature, config.cluster)}`);
}

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
    const [subscriberAta] = await findAssociatedTokenPda({
        owner: subscriberKp.address,
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [merchantAta] = await findAssociatedTokenPda({
        owner: merchantKp.address,
        mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const tokenBalance = async (ata: typeof subscriberAta) => {
        const { value } = await merchant.rpc.getTokenAccountBalance(ata).send();
        return value.uiAmountString;
    };

    console.log('Actors:');
    console.log(`  merchant   ${merchantKp.address}`);
    console.log(`  subscriber ${subscriberKp.address}`);
    console.log(`  puller     ${pullerKp.address} (kairos's future billing key)`);
    console.log(`  mint       ${env.mint} (devUSDC, ${env.decimals} decimals)`);

    // 1. Create plan ---------------------------------------------------------
    logStep('1. merchant: createPlan');
    const planId = BigInt(Date.now());
    const createPlanResult = await withRetry(() =>
        merchant.subscriptions.instructions
            .createPlan({
                planId,
                mint,
                amount: PLAN_AMOUNT,
                periodHours: PERIOD_HOURS,
                endTs: 0,
                destinations: [merchantKp.address],
                pullers: [pullerKp.address],
                metadataUri: '',
            })
            .sendTransaction(),
    );
    logTx('createPlan', createPlanResult);

    const [planPda] = await findPlanPda({ owner: merchantKp.address, planId });
    const plan = await fetchPlan(merchant.rpc, planPda);
    const terms = plan.data.data.terms;
    console.log(`planPda ${planPda}`);
    console.log(
        `terms: amount=${terms.amount} periodHours=${terms.periodHours} createdAt=${terms.createdAt}`,
    );

    // 2. Init subscription authority ------------------------------------------
    logStep('2. subscriber: initSubscriptionAuthority (once per user+mint)');
    const [authorityPda] = await findSubscriptionAuthorityPda({
        user: subscriberKp.address,
        tokenMint: mint,
    });
    const { value: authorityAccount } = await subscriber.rpc
        .getAccountInfo(authorityPda, { encoding: 'base64' })
        .send();
    if (authorityAccount) {
        console.log(`authority ${authorityPda} already initialized — skipping`);
    } else {
        const initResult = await withRetry(() =>
            subscriber.subscriptions.instructions
                .initSubscriptionAuthority({
                    tokenMint: mint,
                    userAta: subscriberAta,
                    tokenProgram: TOKEN_PROGRAM_ADDRESS,
                })
                .sendTransaction(),
        );
        logTx('initSubscriptionAuthority', initResult);
    }

    // 3. Subscribe -------------------------------------------------------------
    logStep('3. subscriber: subscribe');
    await sleep(1500);
    const subscribeResult = await withRetry(() =>
        subscriber.subscriptions.instructions
            .subscribe({ merchant: merchantKp.address, planId, tokenMint: mint })
            .sendTransaction(),
    );
    logTx('subscribe', subscribeResult);

    const [subscriptionPda] = await findSubscriptionDelegationPda({
        planPda,
        subscriber: subscriberKp.address,
    });
    const afterSubscribe = await fetchSubscriptionDelegation(subscriber.rpc, subscriptionPda);
    console.log(`subscriptionPda ${subscriptionPda}`);
    console.log(
        `periodStart=${afterSubscribe.data.currentPeriodStartTs} pulled=${afterSubscribe.data.amountPulledInPeriod} expiresAt=${afterSubscribe.data.expiresAtTs}`,
    );

    // 4. First charge (puller) --------------------------------------------------
    logStep('4. puller: transferSubscription (charge #1)');
    console.log(
        `balances before: subscriber=${await tokenBalance(subscriberAta)} merchant=${await tokenBalance(merchantAta)}`,
    );
    const chargeResult = await withRetry(() =>
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
    logTx('transferSubscription', chargeResult);
    console.log(
        `balances after:  subscriber=${await tokenBalance(subscriberAta)} merchant=${await tokenBalance(merchantAta)}`,
    );

    // 5. Second charge in same period — must fail -------------------------------
    logStep('5. puller: transferSubscription again (expect failure)');
    await sleep(1500);
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
        console.log('UNEXPECTED: second charge in the same period succeeded');
    } catch (error) {
        console.log(`rejected as expected:\n${describeError(error)}`);
    }

    // 6. Cancel ------------------------------------------------------------------
    logStep('6. subscriber: cancelSubscription');
    await sleep(1500);
    const cancelResult = await withRetry(() =>
        subscriber.subscriptions.instructions.cancelSubscription({ planPda }).sendTransaction(),
    );
    logTx('cancelSubscription', cancelResult);
    const afterCancel = await fetchSubscriptionDelegation(subscriber.rpc, subscriptionPda);
    console.log(
        `expiresAt=${afterCancel.data.expiresAtTs} (periodStart=${afterCancel.data.currentPeriodStartTs}, grace = until period end)`,
    );

    // 7. Resume --------------------------------------------------------------------
    logStep('7. subscriber: resumeSubscription');
    await sleep(1500);
    const resumeResult = await withRetry(() =>
        subscriber.subscriptions.instructions.resumeSubscription({ planPda }).sendTransaction(),
    );
    logTx('resumeSubscription', resumeResult);
    const afterResume = await fetchSubscriptionDelegation(subscriber.rpc, subscriptionPda);
    console.log(`expiresAt=${afterResume.data.expiresAtTs} (0 means active again)`);

    console.log('\n✔ Full lifecycle completed against the live devnet program.');
}

main().catch((error) => {
    console.error(`\nLifecycle failed:\n${describeError(error)}`);
    process.exit(1);
});
