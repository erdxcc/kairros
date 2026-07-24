/**
 * Sign-In-With-Solana auth.
 *
 * Flow (stateless, no nonce table):
 *   1. POST /auth/nonce {address} -> server returns the exact `message` to sign
 *      plus a short-lived `nonceToken` (HS256) binding sha256(message)+address.
 *   2. Wallet signs `message`.
 *   3. POST /auth/verify {address, message, signature, nonceToken} -> server
 *      checks the nonceToken (unexpired, matches address + message hash) and
 *      verifies the wallet signature over the message bytes, then issues a
 *      24h session JWT whose subject is the wallet address.
 */
import { createHash } from 'node:crypto';
import { type Address, getBase58Encoder, getUtf8Encoder, verifySignature } from '@solana/kit';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';
import { getDb } from './db';
import { isMerchant } from './queries';

const NONCE_TTL = '5m';
const SESSION_TTL = '24h';

function secret(): Uint8Array {
    const value = process.env.AUTH_SECRET;
    if (value) {
        return new TextEncoder().encode(value);
    }
    // Fail closed: with no configured secret, only an explicit dev opt-in may
    // fall back to the well-known insecure key. Environments where NODE_ENV is
    // unset (staging/preview) must NOT silently accept a forgeable secret that
    // anyone could use to mint sessions for any wallet.
    //
    // In production the opt-in is ignored outright. The key is published in
    // this repository, so honouring the flag there would mean anyone could mint
    // a session for any wallet, and a flag set by accident is exactly how that
    // happens.
    if (process.env.AUTH_ALLOW_INSECURE_SECRET === '1' && process.env.NODE_ENV !== 'production') {
        return new TextEncoder().encode('kairos-dev-insecure-secret-change-me');
    }
    throw new Error(
        'AUTH_SECRET must be set (AUTH_ALLOW_INSECURE_SECRET=1 works for local dev only and is ignored in production)',
    );
}

function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

export async function issueNonceToken(address: string, message: string): Promise<string> {
    return await new SignJWT({ address, messageHash: sha256Hex(message) })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(NONCE_TTL)
        .sign(secret());
}

/** Verifies the wallet signature and the server-issued nonce binding. */
export async function verifySignIn(input: {
    address: string;
    message: string;
    signature: string; // base58
    nonceToken: string;
}): Promise<boolean> {
    let claims: JWTPayload;
    try {
        const { payload } = await jwtVerify(input.nonceToken, secret());
        claims = payload;
    } catch {
        return false; // expired or tampered nonce
    }
    if (claims.address !== input.address) return false;
    if (claims.messageHash !== sha256Hex(input.message)) return false;

    try {
        const addressBytes = new Uint8Array(getBase58Encoder().encode(input.address));
        if (addressBytes.length !== 32) return false;
        const publicKey = await crypto.subtle.importKey('raw', addressBytes, 'Ed25519', true, ['verify']);
        const signatureBytes = new Uint8Array(getBase58Encoder().encode(input.signature));
        const messageBytes = getUtf8Encoder().encode(input.message);
        return await verifySignature(publicKey, signatureBytes as never, messageBytes as never);
    } catch {
        return false;
    }
}

export async function issueSession(address: string): Promise<string> {
    return await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(address)
        .setIssuedAt()
        .setExpirationTime(SESSION_TTL)
        .sign(secret());
}

/**
 * Extracts and verifies the wallet from the Authorization: Bearer header.
 * Returns the wallet address or null.
 *
 * The address is an identity, not a role. Every signed-in wallet is a payer and
 * may read its own subscriptions; the merchant routes add `requireMerchant`.
 */
export async function authenticate(req: Request): Promise<Address | null> {
    const header = req.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    try {
        const { payload } = await jwtVerify(header.slice('Bearer '.length), secret());
        return (payload.sub as Address) ?? null;
    } catch {
        return null;
    }
}

/** The merchant wallet, or the status + message the route should return. */
export type MerchantGate =
    | { ok: true; address: Address }
    | { ok: false; status: number; error: string };

/**
 * Gate for the merchant-scoped routes. Being signed in is not enough: the
 * wallet has to be a merchant, and that check belongs on the server. Hiding
 * merchant navigation in the UI decides what gets rendered, not who gets data.
 */
export async function requireMerchant(req: Request): Promise<MerchantGate> {
    const address = await authenticate(req);
    if (!address) return { ok: false, status: 401, error: 'unauthorized' };
    if (!(await isMerchant(await getDb(), address))) {
        return { ok: false, status: 403, error: 'merchant access required' };
    }
    return { ok: true, address };
}
