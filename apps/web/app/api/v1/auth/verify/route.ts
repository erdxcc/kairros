import { issueSession, verifySignIn } from '@/lib/auth';
import { error, handler, json, tooManyRequests } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ed25519 verification per call, unauthenticated: tighter than /nonce. */
const LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * POST { address, message, signature, nonceToken } -> { token, address }.
 * `token` is the session JWT for `Authorization: Bearer`. It identifies a
 * wallet, nothing more: whether that wallet may reach the merchant routes is
 * decided per request by `requireMerchant`.
 */
export const POST = handler(async (req) => {
    const limit = rateLimit(`verify:${clientKey(req)}`, LIMIT);
    if (!limit.ok) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { address, message, signature, nonceToken } = body;
    if (
        typeof address !== 'string' ||
        typeof message !== 'string' ||
        typeof signature !== 'string' ||
        typeof nonceToken !== 'string'
    ) {
        return error(400, 'address, message, signature, nonceToken are required');
    }
    const ok = await verifySignIn({ address, message, signature, nonceToken });
    // Deliberately one message for a bad signature and for a nonce that was
    // already spent: telling them apart would confirm which captured payloads
    // are worth replaying.
    if (!ok) return error(401, 'invalid signature, or expired/already-used nonce');
    const token = await issueSession(address);
    return json({ token, address });
});
