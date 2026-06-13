import { randomBytes } from 'node:crypto';
import { issueNonceToken } from '@/lib/auth';
import { error, handler, json } from '@/lib/http';
import { buildSignInMessage } from '@kairos/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { address } -> { message, nonceToken }. The wallet signs `message`. */
export const POST = handler(async (req) => {
    const body = (await req.json().catch(() => ({}))) as { address?: string };
    if (!body.address || typeof body.address !== 'string') {
        return error(400, 'address is required');
    }
    const domain = process.env.AUTH_DOMAIN ?? new URL(req.url).host;
    const nonce = randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const message = buildSignInMessage({ domain, address: body.address, nonce, issuedAt });
    const nonceToken = await issueNonceToken(body.address, message);
    return json({ message, nonceToken });
});
