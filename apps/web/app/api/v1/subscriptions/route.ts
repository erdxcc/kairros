import { requireMerchant } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { listSubscriptions } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET -> subscriptions to the signed-in merchant's plans. */
export const GET = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const planPda = new URL(req.url).searchParams.get('plan') ?? undefined;
    const subscriptions = await listSubscriptions(await getDb(), gate.address, planPda);
    return json({ subscriptions });
});
