import { randomBytes } from 'node:crypto';
import { issueNonceToken, signInDomain } from '@/lib/auth';
import { error, handler, json, tooManyRequests } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { buildSignInMessage } from '@kairos/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unauthenticated and it signs a token per call, so it gets a ceiling. */
const LIMIT = { limit: 30, windowMs: 60_000 };

/** POST { address } -> { message, nonceToken }. The wallet signs `message`. */
export const POST = handler(async (req) => {
    const limit = rateLimit(`nonce:${clientKey(req)}`, LIMIT);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await req.json().catch(() => ({}))) as { address?: string };
    if (!body.address || typeof body.address !== 'string') {
        return error(400, 'address is required');
    }
    const domain = signInDomain(req);
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const message = buildSignInMessage({ domain, address: body.address, nonce, issuedAt });
    const nonceToken = await issueNonceToken(body.address, message);
    return json({ message, nonceToken });
});
