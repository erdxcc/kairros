import { authenticate } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { isMerchant } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET -> whether the signed-in wallet has a merchant side at all.
 *
 * The header uses this to decide between showing a way into /merchant and
 * showing nothing. It answers the same question `requireMerchant` answers, so
 * the interface and the gate cannot disagree about who is a merchant.
 */
export const GET = handler(async (req) => {
    const address = await authenticate(req);
    if (!address) return error(401, 'unauthorized');
    return json({ isMerchant: await isMerchant(await getDb(), address) });
});
