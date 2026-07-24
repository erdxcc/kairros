import { requireMerchant } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { listPlans } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET -> the plans owned by the signed-in merchant. */
export const GET = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const plans = await listPlans(await getDb(), gate.address);
    return json({ plans });
});
