import { randomBytes } from 'node:crypto';
import { requireMerchant } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { error, handler, json } from '@/lib/http';
import { UnsafeWebhookUrlError, assertSafeWebhookUrl, dbSchema, webhookAllowPrivate } from '@kairos/core';
import { and, desc, eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET -> the merchant's endpoints. Secrets are never returned after creation. */
export const GET = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const merchant = gate.address;
    const db = await getDb();
    const rows = await db
        .select({
            id: dbSchema.webhookEndpoints.id,
            url: dbSchema.webhookEndpoints.url,
            active: dbSchema.webhookEndpoints.active,
            createdAt: dbSchema.webhookEndpoints.createdAt,
        })
        .from(dbSchema.webhookEndpoints)
        .where(eq(dbSchema.webhookEndpoints.merchant, merchant))
        .orderBy(desc(dbSchema.webhookEndpoints.id));
    return json({ endpoints: rows });
});

/** POST { url } -> creates an endpoint; the signing secret is returned ONCE. */
export const POST = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const merchant = gate.address;
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    if (!body.url || typeof body.url !== 'string') return error(400, 'url is required');
    // Guard against SSRF: https only, no private/loopback/link-local targets.
    // Re-checked at delivery time in the worker, since DNS can change meanwhile.
    try {
        await assertSafeWebhookUrl(body.url, { allowPrivate: webhookAllowPrivate() });
    } catch (err) {
        if (err instanceof UnsafeWebhookUrlError) return error(400, err.message);
        throw err;
    }

    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const db = await getDb();
    const inserted = await db
        .insert(dbSchema.webhookEndpoints)
        .values({ merchant, url: body.url, secret })
        .returning({ id: dbSchema.webhookEndpoints.id });
    // The secret is shown once; store it now to verify signatures.
    return json({ id: inserted[0]?.id, url: body.url, secret }, { status: 201 });
});

/** DELETE ?id= -> deactivates an endpoint owned by the merchant. */
export const DELETE = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const merchant = gate.address;
    const idParam = new URL(req.url).searchParams.get('id');
    const id = Number.parseInt(idParam ?? '', 10);
    if (!Number.isFinite(id)) return error(400, 'id is required');
    const db = await getDb();
    const updated = await db
        .update(dbSchema.webhookEndpoints)
        .set({ active: false })
        .where(and(eq(dbSchema.webhookEndpoints.id, id), eq(dbSchema.webhookEndpoints.merchant, merchant)))
        .returning({ id: dbSchema.webhookEndpoints.id });
    if (updated.length === 0) return error(404, 'endpoint not found');
    return json({ id, active: false });
});
