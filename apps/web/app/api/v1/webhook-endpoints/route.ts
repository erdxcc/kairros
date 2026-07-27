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

/**
 * Per-merchant ceiling. Every active endpoint multiplies the delivery rows and
 * the outbound requests each event produces, so this is a shared-resource
 * limit, not a product one.
 */
const MAX_ACTIVE_ENDPOINTS = 20;

/** POST { url } -> creates an endpoint; the signing secret is returned ONCE. */
export const POST = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const merchant = gate.address;
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    if (!body.url || typeof body.url !== 'string') return error(400, 'url is required');
    // Guard against SSRF: https only, no private/loopback/link-local targets.
    // Re-checked at delivery time in the worker, since DNS can change meanwhile.
    let parsed: URL;
    try {
        parsed = await assertSafeWebhookUrl(body.url, { allowPrivate: webhookAllowPrivate() });
    } catch (err) {
        if (err instanceof UnsafeWebhookUrlError) return error(400, err.message);
        throw err;
    }

    const db = await getDb();
    const active = await db
        .select({ id: dbSchema.webhookEndpoints.id, url: dbSchema.webhookEndpoints.url })
        .from(dbSchema.webhookEndpoints)
        .where(
            and(eq(dbSchema.webhookEndpoints.merchant, merchant), eq(dbSchema.webhookEndpoints.active, true)),
        );
    if (active.length >= MAX_ACTIVE_ENDPOINTS) {
        return error(409, `at most ${MAX_ACTIVE_ENDPOINTS} active endpoints per merchant`);
    }
    // Registering the same URL twice doubles every delivery to it, which reads
    // as a retry storm on the receiving end. Both forms are compared because
    // rows written before normalization hold the raw string.
    if (active.some((e) => e.url === parsed.href || e.url === body.url)) {
        return error(409, 'this url is already registered');
    }

    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    // Store what was validated, not what was typed. The guard parsed the URL
    // and the worker delivers to whatever this column holds, so keeping the raw
    // string would leave the vetted value and the used value as two strings
    // that merely happen to agree today.
    const url = parsed.href;
    const inserted = await db
        .insert(dbSchema.webhookEndpoints)
        .values({ merchant, url, secret })
        .returning({ id: dbSchema.webhookEndpoints.id });
    // The secret is shown once; store it now to verify signatures.
    return json({ id: inserted[0]?.id, url, secret }, { status: 201 });
});

/** DELETE ?id= -> deactivates an endpoint owned by the merchant. */
export const DELETE = handler(async (req) => {
    const gate = await requireMerchant(req);
    if (!gate.ok) return error(gate.status, gate.error);
    const merchant = gate.address;
    const idParam = new URL(req.url).searchParams.get('id');
    // Strict: `parseInt` would happily read "12abc" as 12 and delete endpoint 12.
    if (!idParam || !/^\d+$/.test(idParam)) return error(400, 'id is required');
    const id = Number(idParam);
    if (!Number.isSafeInteger(id)) return error(400, 'id is required');
    const db = await getDb();
    const updated = await db
        .update(dbSchema.webhookEndpoints)
        .set({ active: false })
        .where(and(eq(dbSchema.webhookEndpoints.id, id), eq(dbSchema.webhookEndpoints.merchant, merchant)))
        .returning({ id: dbSchema.webhookEndpoints.id });
    if (updated.length === 0) return error(404, 'endpoint not found');
    return json({ id, active: false });
});
