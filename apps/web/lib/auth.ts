/**
 * Sign-In-With-Solana auth.
 *
 * Flow:
 *   1. POST /auth/nonce {address} -> server returns the exact `message` to sign
 *      plus a short-lived `nonceToken` (HS256) binding sha256(message)+address.
 *   2. Wallet signs `message`.
 *   3. POST /auth/verify {address, message, signature, nonceToken} -> server
 *      checks the nonceToken (unexpired, unused, matches address + message
 *      hash) and verifies the wallet signature over the message bytes, then
 *      issues a 24h session JWT whose subject is the wallet address.
 *
 * Both tokens are HS256 under the same secret, so each carries a `typ` claim
 * and every check demands the type it expects: a nonce must never be usable as
 * a session, and the claim shape happening not to line up is luck, not a rule.
 *
 * Both also carry a `jti`, which is what makes them revocable. A nonce is
 * burned on use, so a captured signature cannot be replayed inside the nonce's
 * five minute window. A session id is recorded on logout, so signing out ends
 * the session on the server instead of only clearing the browser's copy.
 */
import { createHash, randomUUID } from 'node:crypto';
import { type KairosDb, dbSchema } from '@kairos/core';
import { type Address, getBase58Encoder, getUtf8Encoder, verifySignature } from '@solana/kit';
import { eq, lt, sql } from 'drizzle-orm';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';
import { getDb } from './db';
import { isMerchant } from './queries';

const NONCE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 24 * 60 * 60;

const TYP_NONCE = 'kairos-nonce';
const TYP_SESSION = 'kairos-session';

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

/**
 * The domain named in the Sign-In-With-Solana message.
 *
 * Never the request's Host header in production. That header is attacker
 * controlled, so trusting it lets anyone have this server mint a correctly
 * signed nonce for a message that reads "evil.example wants you to sign in" —
 * turning our own endpoint into the credible half of a phishing page. The
 * domain line exists to let a wallet and its owner recognise who is asking;
 * it is only worth anything if the server, not the caller, decides what it says.
 */
export function signInDomain(req: Request): string {
    const configured = process.env.AUTH_DOMAIN;
    if (configured) return configured;
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            'AUTH_DOMAIN must be set in production: it is the domain shown in the sign-in message, and deriving it from the request Host header would let a caller choose it',
        );
    }
    return new URL(req.url).host;
}

function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

export async function issueNonceToken(address: string, message: string): Promise<string> {
    return await new SignJWT({ typ: TYP_NONCE, address, messageHash: sha256Hex(message) })
        .setProtectedHeader({ alg: 'HS256' })
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(`${NONCE_TTL_SECONDS}s`)
        .sign(secret());
}

export async function issueSession(address: string): Promise<string> {
    return await new SignJWT({ typ: TYP_SESSION })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(address)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(secret());
}

/** Verifies signature, expiry and `typ`. Returns the claims or null. */
async function verifyTyped(token: string, typ: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jwtVerify(token, secret());
        if (payload.typ !== typ) return null;
        return payload;
    } catch {
        return null; // expired, tampered, or signed with another secret
    }
}

/** True when this token id has already been spent (used nonce, revoked session). */
async function isConsumed(db: KairosDb, jti: string): Promise<boolean> {
    const found = await db
        .select({ jti: dbSchema.consumedTokens.jti })
        .from(dbSchema.consumedTokens)
        .where(eq(dbSchema.consumedTokens.jti, jti))
        .limit(1);
    return found.length > 0;
}

/**
 * Marks a token id spent. Returns false when it was already spent, which is
 * how a replay is detected: the insert, not a preceding read, is what decides,
 * so two simultaneous uses of one nonce cannot both win.
 */
async function consume(
    db: KairosDb,
    jti: string,
    purpose: 'nonce' | 'session',
    expiresAt: Date,
): Promise<boolean> {
    const inserted = await db
        .insert(dbSchema.consumedTokens)
        .values({ jti, purpose, expiresAt })
        .onConflictDoNothing()
        .returning({ jti: dbSchema.consumedTokens.jti });
    return inserted.length > 0;
}

/** Drops rows for tokens that have expired anyway. Best-effort housekeeping. */
export async function pruneConsumedTokens(db: KairosDb): Promise<void> {
    await db.delete(dbSchema.consumedTokens).where(lt(dbSchema.consumedTokens.expiresAt, sql`now()`));
}

/** Claims expiry as a Date, falling back to the nominal TTL if absent. */
function expiryOf(claims: JWTPayload, fallbackSeconds: number): Date {
    return claims.exp ? new Date(claims.exp * 1000) : new Date(Date.now() + fallbackSeconds * 1000);
}

/**
 * Verifies the wallet signature and the server-issued nonce binding, and burns
 * the nonce so the same (message, signature) pair cannot be presented twice.
 */
export async function verifySignIn(
    input: {
        address: string;
        message: string;
        signature: string; // base58
        nonceToken: string;
    },
    db?: KairosDb,
): Promise<boolean> {
    const claims = await verifyTyped(input.nonceToken, TYP_NONCE);
    if (!claims) return false;
    if (claims.address !== input.address) return false;
    if (claims.messageHash !== sha256Hex(input.message)) return false;
    if (typeof claims.jti !== 'string') return false;

    let signatureValid = false;
    try {
        const addressBytes = new Uint8Array(getBase58Encoder().encode(input.address));
        if (addressBytes.length !== 32) return false;
        const publicKey = await crypto.subtle.importKey('raw', addressBytes, 'Ed25519', true, ['verify']);
        const signatureBytes = new Uint8Array(getBase58Encoder().encode(input.signature));
        const messageBytes = getUtf8Encoder().encode(input.message);
        signatureValid = await verifySignature(publicKey, signatureBytes as never, messageBytes as never);
    } catch {
        return false;
    }
    if (!signatureValid) return false;

    // Burn last: a wrong signature must not consume the nonce, or anyone could
    // invalidate someone else's in-flight sign-in by guessing at it.
    const database = db ?? (await getDb());
    return await consume(database, claims.jti, 'nonce', expiryOf(claims, NONCE_TTL_SECONDS));
}

/**
 * Extracts and verifies the wallet from the Authorization: Bearer header.
 * Returns the wallet address or null.
 *
 * The address is an identity, not a role. Every signed-in wallet is a payer and
 * may read its own subscriptions; the merchant routes add `requireMerchant`.
 */
export async function authenticate(req: Request, db?: KairosDb): Promise<Address | null> {
    const header = req.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return null;
    const claims = await verifyTyped(header.slice('Bearer '.length), TYP_SESSION);
    if (!claims?.sub) return null;
    // A signed, unexpired token is not enough: it also has to not have been
    // signed out. Without this, "sign out" only means "this browser forgot",
    // and a token lifted before that stays good for the rest of its 24 hours.
    if (typeof claims.jti === 'string') {
        const database = db ?? (await getDb());
        if (await isConsumed(database, claims.jti)) return null;
    }
    return claims.sub as Address;
}

/** Revokes the session presented in the Authorization header, if any. */
export async function revokeSession(req: Request, db?: KairosDb): Promise<boolean> {
    const header = req.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) return false;
    const claims = await verifyTyped(header.slice('Bearer '.length), TYP_SESSION);
    if (!claims || typeof claims.jti !== 'string') return false;
    const database = db ?? (await getDb());
    await consume(database, claims.jti, 'session', expiryOf(claims, SESSION_TTL_SECONDS));
    // Signing out is rare and already a write, so it is a good moment to drop
    // rows whose tokens have expired anyway.
    await pruneConsumedTokens(database).catch(() => {});
    return true;
}

/** The merchant wallet, or the status + message the route should return. */
export type MerchantGate = { ok: true; address: Address } | { ok: false; status: number; error: string };

/**
 * Gate for the merchant-scoped routes. Being signed in is not enough: the
 * wallet has to be a merchant, and that check belongs on the server. Hiding
 * merchant navigation in the UI decides what gets rendered, not who gets data.
 */
export async function requireMerchant(req: Request): Promise<MerchantGate> {
    const db = await getDb();
    const address = await authenticate(req, db);
    if (!address) return { ok: false, status: 401, error: 'unauthorized' };
    if (!(await isMerchant(db, address))) {
        return { ok: false, status: 403, error: 'merchant access required' };
    }
    return { ok: true, address };
}
