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
 *      24h session JWT whose subject is the merchant wallet address.
 */
import { createHash } from 'node:crypto';
import { type Address, getBase58Encoder, getUtf8Encoder, verifySignature } from '@solana/kit';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';

const NONCE_TTL = '5m';
const SESSION_TTL = '24h';

function secret(): Uint8Array {
    const value = process.env.AUTH_SECRET;
    if (!value) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('AUTH_SECRET must be set in production');
        }
        return new TextEncoder().encode('kairos-dev-insecure-secret-change-me');
    }
    return new TextEncoder().encode(value);
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

export async function issueSession(merchant: string): Promise<string> {
    return await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(merchant)
        .setIssuedAt()
        .setExpirationTime(SESSION_TTL)
        .sign(secret());
}

/**
 * Extracts and verifies the merchant from the Authorization: Bearer header.
 * Returns the merchant wallet address or null.
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
