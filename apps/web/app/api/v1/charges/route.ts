import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { listCharges } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
    const merchant = await authenticate(req);
    if (!merchant) return error(401, 'unauthorized');
    const limitParam = Number.parseInt(new URL(req.url).searchParams.get('limit') ?? '100', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;
    const charges = await listCharges(await getDb(), merchant, limit);
    return json({ charges });
});
