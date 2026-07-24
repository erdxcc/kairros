import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { listMySubscriptions } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET -> the signed-in wallet's own subscriptions, with the plan terms it
 * agreed to. Any signed-in wallet may call this: being a payer is not a role
 * that needs granting, it is what signing in means.
 */
export const GET = handler(async (req) => {
    const address = await authenticate(req);
    if (!address) return error(401, 'unauthorized');
    const subscriptions = await listMySubscriptions(await getDb(), address);
    return json({ subscriptions });
});
