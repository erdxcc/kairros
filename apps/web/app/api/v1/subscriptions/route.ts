import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { listSubscriptions } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
    const merchant = await authenticate(req);
    if (!merchant) return error(401, 'unauthorized');
    const planPda = new URL(req.url).searchParams.get('plan') ?? undefined;
    const subscriptions = await listSubscriptions(await getDb(), merchant, planPda);
    return json({ subscriptions });
});
