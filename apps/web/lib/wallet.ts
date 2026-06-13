import { getBase58Decoder } from '@solana/kit';
/**
 * Browser wallet integration via the Wallet Standard — no legacy web3.js.
 *
 * We enumerate registered wallets, connect to get the user's account (whose
 * `address` is the base58 pubkey), and sign the server's SIWS message with the
 * `solana:signMessage` feature. The signature bytes are base58-encoded with
 * `@solana/kit` to match what /api/v1/auth/verify expects.
 *
 * NOTE: this path requires a real wallet extension (Phantom, Solflare, …) and
 * is therefore exercised manually in a browser, not in headless CI.
 */
import { SolanaSignMessage, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { StandardConnect, type StandardConnectFeature } from '@wallet-standard/features';

export interface DetectedWallet {
    name: string;
    icon?: string;
    wallet: Wallet;
}

/** Wallets that can both connect and sign messages (what SIWS needs). */
export function listWallets(): DetectedWallet[] {
    if (typeof window === 'undefined') return [];
    return getWallets()
        .get()
        .filter((w) => StandardConnect in w.features && SolanaSignMessage in w.features)
        .map((w) => ({ name: w.name, icon: w.icon, wallet: w }));
}

/** Subscribe to wallet (un)registration; returns an unsubscribe function. */
export function onWalletsChange(cb: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const wallets = getWallets();
    const offRegister = wallets.on('register', cb);
    const offUnregister = wallets.on('unregister', cb);
    return () => {
        offRegister();
        offUnregister();
    };
}

/** Connect and return the active account (its `address` is the pubkey). */
export async function connect(wallet: Wallet): Promise<WalletAccount> {
    const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect];
    const { accounts } = await feature.connect();
    const account = accounts[0] ?? wallet.accounts[0];
    if (!account) throw new Error('Wallet returned no account');
    return account;
}

/** Sign a UTF-8 message; returns the base58 signature. */
export async function signMessage(wallet: Wallet, account: WalletAccount, message: string): Promise<string> {
    const feature = wallet.features[SolanaSignMessage] as SolanaSignMessageFeature[typeof SolanaSignMessage];
    const [output] = await feature.signMessage({
        account,
        message: new TextEncoder().encode(message),
    });
    if (!output) throw new Error('Wallet did not return a signature');
    return getBase58Decoder().decode(output.signature);
}
