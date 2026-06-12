/**
 * One-time devnet environment setup:
 *
 *   1. Generates merchant / subscriber / puller keypairs (via solana-keygen)
 *   2. Funds them with a little SOL from the default Solana CLI wallet
 *   3. Creates a 6-decimal test mint ("devUSDC") and mints balances:
 *      - subscriber: 1,000 devUSDC (will pay for the subscription)
 *      - merchant:   1 devUSDC (just to create the receiving ATA)
 *   4. Writes .keys/devnet.json consumed by `pnpm demo:lifecycle`
 *
 * Prerequisites: Solana CLI installed and `solana config` pointing at a funded
 * devnet wallet (or set PAYER_KEYPAIR_PATH).
 *
 * Safe to re-run: existing keys and mint are reused.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tokenProgram } from '@solana-program/token';
import { address, createClient, generateKeyPairSigner } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { signer } from '@solana/kit-plugin-signer';
import { loadConfig } from '../src/config.js';
import {
    type DevnetEnv,
    devnetEnvPath,
    extractSignature,
    loadKeypairSigner,
    readDevnetEnv,
} from './shared.js';

const ACTORS = ['merchant', 'subscriber', 'puller'] as const;
const DECIMALS = 6;
const FUND_SOL = '0.2';
const MIN_LAMPORTS = 50_000_000n; // refund an actor when below 0.05 SOL

const config = loadConfig();
const payerPath = process.env.PAYER_KEYPAIR_PATH ?? join(homedir(), '.config', 'solana', 'id.json');

function sh(cmd: string, args: string[]): string {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

async function main() {
    if (!existsSync(payerPath)) {
        throw new Error(`Payer keypair not found at ${payerPath}. Set PAYER_KEYPAIR_PATH.`);
    }
    mkdirSync(config.keysDir, { recursive: true });

    // 1. Keypairs ------------------------------------------------------------
    for (const name of ACTORS) {
        const file = join(config.keysDir, `${name}.json`);
        if (existsSync(file)) {
            console.log(`[keys] ${name}: reusing ${file}`);
        } else {
            sh('solana-keygen', ['new', '--no-bip39-passphrase', '--silent', '--force', '-o', file]);
            console.log(`[keys] ${name}: generated ${file}`);
        }
    }
    const merchant = await loadKeypairSigner(join(config.keysDir, 'merchant.json'));
    const subscriber = await loadKeypairSigner(join(config.keysDir, 'subscriber.json'));
    const puller = await loadKeypairSigner(join(config.keysDir, 'puller.json'));
    const payer = await loadKeypairSigner(payerPath);

    const client = createClient()
        .use(signer(payer))
        .use(solanaRpc({ rpcUrl: config.rpcUrl }))
        .use(tokenProgram());

    // 2. Funding -------------------------------------------------------------
    for (const actor of [merchant, subscriber, puller]) {
        const { value: balance } = await client.rpc.getBalance(actor.address).send();
        if (BigInt(balance) >= MIN_LAMPORTS) {
            console.log(`[fund] ${actor.address}: ${Number(balance) / 1e9} SOL, ok`);
            continue;
        }
        sh('solana', [
            'transfer',
            actor.address,
            FUND_SOL,
            '--allow-unfunded-recipient',
            '--url',
            config.rpcUrl,
            '--keypair',
            payerPath,
        ]);
        console.log(`[fund] ${actor.address}: sent ${FUND_SOL} SOL`);
    }

    // 3. Test mint -----------------------------------------------------------
    let mintAddress: string | undefined;
    try {
        const existing = readDevnetEnv(config.keysDir);
        const { value } = await client.rpc
            .getAccountInfo(address(existing.mint), { encoding: 'base64' })
            .send();
        if (value) {
            mintAddress = existing.mint;
            console.log(`[mint] reusing devUSDC mint ${mintAddress}`);
        }
    } catch {
        // no summary yet — create a fresh mint below
    }

    if (!mintAddress) {
        const newMint = await generateKeyPairSigner();
        const created = await client.token.instructions
            .createMint({ newMint, decimals: DECIMALS, mintAuthority: payer.address })
            .sendTransaction();
        mintAddress = newMint.address;
        console.log(`[mint] created devUSDC mint ${mintAddress} (${extractSignature(created)})`);

        const toSubscriber = await client.token.instructions
            .mintToATA({
                mint: newMint.address,
                owner: subscriber.address,
                mintAuthority: payer,
                amount: 1_000_000_000n, // 1,000 devUSDC
                decimals: DECIMALS,
            })
            .sendTransaction();
        console.log(`[mint] subscriber funded with 1,000 devUSDC (${extractSignature(toSubscriber)})`);

        const toMerchant = await client.token.instructions
            .mintToATA({
                mint: newMint.address,
                owner: merchant.address,
                mintAuthority: payer,
                amount: 1_000_000n, // 1 devUSDC — creates the merchant's receiving ATA
                decimals: DECIMALS,
            })
            .sendTransaction();
        console.log(`[mint] merchant ATA created with 1 devUSDC (${extractSignature(toMerchant)})`);
    }

    // 4. Summary -------------------------------------------------------------
    const summary: DevnetEnv = {
        mint: mintAddress,
        decimals: DECIMALS,
        merchant: merchant.address,
        subscriber: subscriber.address,
        puller: puller.address,
        rpcUrl: config.rpcUrl,
        createdAt: new Date().toISOString(),
    };
    writeFileSync(devnetEnvPath(config.keysDir), `${JSON.stringify(summary, null, 4)}\n`);
    console.log(`\nWrote ${devnetEnvPath(config.keysDir)}:`);
    console.log(summary);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
