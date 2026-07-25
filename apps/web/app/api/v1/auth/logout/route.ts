import { revokeSession } from '@/lib/auth';
import { handler, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST -> revokes the presented session.
 *
 * Always 200, whether or not there was a valid session to revoke: signing out
 * should not be a way to probe which tokens are live, and a client clearing
 * its own state has nothing useful to do with the difference.
 */
export const POST = handler(async (req) => {
    await revokeSession(req);
    return json({ ok: true });
});
