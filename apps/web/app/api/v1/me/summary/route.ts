import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { getMySummary } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET -> what is running, what it cost in 30 days, when money moves next. */
export const GET = handler(async (req) => {
    const address = await authenticate(req);
    if (!address) return error(401, 'unauthorized');
    const summary = await getMySummary(await getDb(), address);
    return json({ summary });
});
