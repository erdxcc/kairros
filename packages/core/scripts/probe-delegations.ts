/**
 * Generates FixedTransfer and RecurringTransfer events on devnet so the
 * fixture recorder can capture all six event types. Flow:
 *
 *   1. subscriber creates a fixed delegation to the merchant, merchant pulls
 *   2. subscriber creates a recurring delegation to the merchant, merchant pulls
 *
 * kairos's MVP scope only *indexes* fixed/recurring delegations (no UI),
 * but the decoders must cover every event the program emits.
 */
import { join } from 'node:path';
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from '@solana-program/token';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import {
    findFixedDelegationPda,
    findRecurringDelegationPda,
    findSubscriptionAuthorityPda,
    subscriptionsProgram,
} from '@solana/subscriptions';
import { loadConfig } from '../src/index.js';
import {
    describeError,
    extractSignature,
    loadKeypairSigner,
    readDevnetEnv,
    sleep,
    withRetry,
} from './shared.js';

const config = loadConfig();
const env = readDevnetEnv(config.keysDir);

async function main() {
    const merchantKp = await loadKeypairSigner(join(config.keysDir, 'merchant.json'));
    const subscriberKp = await loadKeypairSigner(join(config.keysDir, 'subscriber.json'));

    const makeClient = (kp: typeof merchantKp) =>
        createClient()
            .use(signer(kp))
            .use(solanaRpc({ rpcUrl: config.rpcUrl }))
            .use(subscriptionsProgram());

    const subscriber = makeClient(subscriberKp); // delegator
    const merchant = makeClient(merchantKp); // delegatee

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
    const [authorityPda] = await findSubscriptionAuthorityPda({
        user: subscriberKp.address,
        tokenMint: mint,
    });

    const now = Math.floor(Date.now() / 1000);

    // --- Fixed delegation: 3 devUSDC allowance, pull 1 ----------------------
    const fixedNonce = BigInt(Date.now());
    const createdFixed = await withRetry(() =>
        subscriber.subscriptions.instructions
            .createFixedDelegation({
                delegatee: merchantKp.address,
                tokenMint: mint,
                amount: 3_000_000n,
                expiryTs: now + 3600,
                nonce: fixedNonce,
            })
            .sendTransaction(),
    );
    console.log(`createFixedDelegation: ${extractSignature(createdFixed)}`);

    const [fixedPda] = await findFixedDelegationPda({
        subscriptionAuthority: authorityPda,
        delegator: subscriberKp.address,
        delegatee: merchantKp.address,
        nonce: fixedNonce,
    });

    await sleep(1500);
    const pulledFixed = await withRetry(() =>
        merchant.subscriptions.instructions
            .transferFixed({
                amount: 1_000_000n,
                delegationPda: fixedPda,
                delegator: subscriberKp.address,
                delegatorAta: subscriberAta,
                receiverAta: merchantAta,
                tokenMint: mint,
                tokenProgram: TOKEN_PROGRAM_ADDRESS,
            })
            .sendTransaction(),
    );
    console.log(`transferFixed (1 devUSDC): ${extractSignature(pulledFixed)}`);

    // --- Recurring delegation: 2 devUSDC / hour, pull 1 ----------------------
    const recurringNonce = BigInt(Date.now() + 1);
    const startTs = Math.floor(Date.now() / 1000) + 10;
    const createdRecurring = await withRetry(() =>
        subscriber.subscriptions.instructions
            .createRecurringDelegation({
                delegatee: merchantKp.address,
                tokenMint: mint,
                amountPerPeriod: 2_000_000n,
                periodLengthS: 3600,
                startTs,
                expiryTs: startTs + 7200,
                nonce: recurringNonce,
            })
            .sendTransaction(),
    );
    console.log(`createRecurringDelegation: ${extractSignature(createdRecurring)}`);

    const [recurringPda] = await findRecurringDelegationPda({
        subscriptionAuthority: authorityPda,
        delegator: subscriberKp.address,
        delegatee: merchantKp.address,
        nonce: recurringNonce,
    });

    const waitMs = Math.max(0, startTs * 1000 - Date.now()) + 2000;
    console.log(`waiting ${Math.ceil(waitMs / 1000)}s for the recurring delegation to start...`);
    await sleep(waitMs);

    const pulledRecurring = await withRetry(() =>
        merchant.subscriptions.instructions
            .transferRecurring({
                amount: 1_000_000n,
                delegationPda: recurringPda,
                delegator: subscriberKp.address,
                delegatorAta: subscriberAta,
                receiverAta: merchantAta,
                tokenMint: mint,
                tokenProgram: TOKEN_PROGRAM_ADDRESS,
            })
            .sendTransaction(),
    );
    console.log(`transferRecurring (1 devUSDC): ${extractSignature(pulledRecurring)}`);

    console.log('\n✔ Fixed and recurring transfer events emitted.');
}

main().catch((error) => {
    console.error(describeError(error));
    process.exit(1);
});
