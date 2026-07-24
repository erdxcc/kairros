import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { listMyCharges } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET -> charges pulled from the signed-in wallet (succeeded and failed). */
export const GET = handler(async (req) => {
    const address = await authenticate(req);
    if (!address) return error(401, 'unauthorized');
    const limitParam = Number.parseInt(new URL(req.url).searchParams.get('limit') ?? '100', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
    const charges = await listMyCharges(await getDb(), address, limit);
    return json({ charges });
});
