import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { getMySubscription } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Next 15 hands dynamic segments over as a promise. */
type Context = { params: Promise<{ pda: string }> };

/**
 * GET -> one of the signed-in wallet's subscriptions.
 *
 * The PDA arrives from the URL, so the lookup is scoped by subscriber as well:
 * a wallet asking for someone else's subscription gets 404, not a peek.
 *
 * It comes from the route params rather than from slicing the pathname: the
 * router has already decoded the segment, and taking the last path element
 * quietly means "whatever is at the end of the URL", which stops being the PDA
 * the moment this route gains a nested segment.
 */
export const GET = handler<Context>(async (req, ctx) => {
    const address = await authenticate(req);
    if (!address) return error(401, 'unauthorized');
    const { pda } = await ctx.params;
    if (!pda) return error(400, 'subscription pda is required');
    const subscription = await getMySubscription(await getDb(), address, pda);
    if (!subscription) return error(404, 'not found');
    return json({ subscription });
});
