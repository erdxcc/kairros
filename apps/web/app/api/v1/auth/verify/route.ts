import { issueSession, verifySignIn } from '@/lib/auth';
import { error, handler, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { address, message, signature, nonceToken } -> { token, address }.
 * `token` is the session JWT for `Authorization: Bearer`. It identifies a
 * wallet, nothing more: whether that wallet may reach the merchant routes is
 * decided per request by `requireMerchant`.
 */
export const POST = handler(async (req) => {
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
    if (!ok) return error(401, 'invalid signature or expired nonce');
    const token = await issueSession(address);
    return json({ token, address });
});
