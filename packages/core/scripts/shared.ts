/**
 * Shared helpers for the devnet scripts (setup + lifecycle demo).
 * These are developer tools, not part of the library surface.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type KeyPairSigner, createKeyPairSignerFromBytes } from '@solana/kit';
import { type SubscriptionsError, getSubscriptionsErrorMessage } from '@solana/subscriptions';

/** Loads a Solana CLI keypair file (JSON array of 64 bytes) as a Kit signer. */
export async function loadKeypairSigner(path: string): Promise<KeyPairSigner> {
    const bytes = new Uint8Array(JSON.parse(readFileSync(path, 'utf8')));
    return await createKeyPairSignerFromBytes(bytes);
}

export interface DevnetEnv {
    mint: string;
    decimals: number;
    merchant: string;
    subscriber: string;
    puller: string;
    rpcUrl: string;
    createdAt: string;
}

export function devnetEnvPath(keysDir: string): string {
    return join(keysDir, 'devnet.json');
}

export function readDevnetEnv(keysDir: string): DevnetEnv {
    try {
        return JSON.parse(readFileSync(devnetEnvPath(keysDir), 'utf8')) as DevnetEnv;
    } catch {
        throw new Error(`Missing ${devnetEnvPath(keysDir)} — run \`pnpm setup:devnet\` first.`);
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async action when the public devnet RPC rate-limits us (HTTP 429).
 * Anything else is rethrown immediately.
 */
export async function withRetry<T>(action: () => Promise<T>, attempts = 4): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await action();
        } catch (error) {
            const message = describeError(error);
            const rateLimited = message.includes('429') || message.includes('Too Many Requests');
            if (!rateLimited || attempt >= attempts) throw error;
            const delay = 2000 * 2 ** (attempt - 1);
            console.log(`  (rate limited by RPC, retrying in ${delay / 1000}s...)`);
            await sleep(delay);
        }
    }
}

/** JSON.stringify that tolerates BigInt values (renders them as strings). */
export function stringifySafe(value: unknown): string {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/**
 * Pulls a transaction signature out of whatever `sendTransaction()` resolves
 * to. The Kit transaction-plan result shape is still settling in 0.x, so we
 * search the object graph for a signature-keyed string and fall back to a
 * JSON dump for inspection.
 */
export function extractSignature(result: unknown): string {
    if (typeof result === 'string') return result;
    const found = findSignature(result, 0);
    if (found) return found;
    return `<unknown result shape: ${stringifySafe(result)?.slice(0, 400)}>`;
}

function findSignature(node: unknown, depth: number): string | undefined {
    if (!node || typeof node !== 'object' || depth > 6) return undefined;
    const record = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
        if (/signature/i.test(key)) {
            if (typeof value === 'string') return value;
            if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
            // e.g. a `signatures: { <address>: <sig> }` map
            if (value && typeof value === 'object') {
                const first = Object.values(value)[0];
                if (typeof first === 'string') return first;
            }
        }
    }
    for (const value of Object.values(record)) {
        const found = findSignature(value, depth + 1);
        if (found) return found;
    }
    return undefined;
}

/**
 * Renders an error thrown by a transaction send, resolving Subscriptions
 * program custom error codes to their names where possible.
 */
export function describeError(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
        parts.push(current.message);
        current = current.cause;
    }
    const combined = parts.join(' <- ');
    const match = combined.match(/custom program error: (0x[0-9a-fA-F]+|\d+)/);
    if (match?.[1]) {
        const code = Number(match[1]);
        // The generated lookup covers all program error codes; unknown codes
        // fall through and we return the raw message chain unchanged.
        const message = getSubscriptionsErrorMessage(code as SubscriptionsError);
        if (message) {
            return `${combined}\n  -> Subscriptions error ${code}: ${message}`;
        }
    }
    return combined;
}
