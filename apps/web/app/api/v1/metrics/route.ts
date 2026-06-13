import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { getMetrics } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
    const merchant = await authenticate(req);
    if (!merchant) return error(401, 'unauthorized');
    const metrics = await getMetrics(await getDb(), merchant);
    return json({ metrics });
});
