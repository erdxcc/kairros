/**
 * PullerSigner: the abstraction behind kairos's service billing key.
 *
 * The billing scheduler executes `transferSubscription` with whatever signer
 * this interface yields. Implementations:
 *
 *   - `envKeypairPullerSigner` — loads a Solana CLI keypair file. Devnet only:
 *     on devnet the key guards nothing of value.
 *   - A KMS-backed implementation lands in the mainnet milestone; nothing in
 *     the scheduler may assume access to raw key bytes.
 *
 * Security note: even a leaked puller key cannot redirect funds — the program
 * only allows transfers to ATAs owned by the plan's immutable `destinations`,
 * within per-period amount caps.
 */
import { readFileSync } from 'node:fs';
import { type KeyPairSigner, createKeyPairSignerFromBytes } from '@solana/kit';

export interface PullerSigner {
    /** Returns the transaction signer for charge execution. */
    getSigner(): Promise<KeyPairSigner>;
}

/** Devnet implementation: reads a Solana CLI keypair JSON from disk. */
export function envKeypairPullerSigner(path: string): PullerSigner {
    let cached: KeyPairSigner | undefined;
    return {
        async getSigner() {
            if (!cached) {
                const bytes = new Uint8Array(JSON.parse(readFileSync(path, 'utf8')));
                cached = await createKeyPairSignerFromBytes(bytes);
            }
            return cached;
        },
    };
}
