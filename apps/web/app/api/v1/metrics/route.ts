import { requireMerchant } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { getMetrics } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET -> revenue and churn metrics for the signed-in merchant. */
export const GET = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const metrics = await getMetrics(await getDb(), gate.address);
    return json({ metrics });
});
