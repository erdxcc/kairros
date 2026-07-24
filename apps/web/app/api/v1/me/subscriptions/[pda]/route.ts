import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { getMySubscription } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET -> one of the signed-in wallet's subscriptions.
 *
 * The PDA arrives from the URL, so the lookup is scoped by subscriber as well:
 * a wallet asking for someone else's subscription gets 404, not a peek.
 */
export const GET = handler(async (req) => {
    const address = await authenticate(req);
    if (!address) return error(401, 'unauthorized');
    const pda = decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? '');
    if (!pda) return error(400, 'subscription pda is required');
    const subscription = await getMySubscription(await getDb(), address, pda);
    if (!subscription) return error(404, 'not found');
    return json({ subscription });
});
