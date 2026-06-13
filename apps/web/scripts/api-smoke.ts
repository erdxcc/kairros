/**
 * Headless smoke test for the REST API. Performs the full SIWS flow with the
 * devnet merchant keypair, then exercises every endpoint with the session
 * token. Assumes the server is already running (BASE_URL, default :3000) and
 * the worker has populated projections for this merchant.
 *
 *   pnpm --filter @kairos/web api:smoke
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createKeyPairSignerFromBytes, getBase58Decoder } from '@solana/kit';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const KEYS_DIR = process.env.KEYS_DIR ?? join(process.cwd(), '..', '..', '.keys');

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
    console.log(`${cond ? '✓' : '✗'} ${label}`);
    if (!cond) {
        failures++;
        if (detail !== undefined) console.log('   ', JSON.stringify(detail));
    }
}

async function main() {
    const bytes = new Uint8Array(JSON.parse(readFileSync(join(KEYS_DIR, 'merchant.json'), 'utf8')));
    const merchant = await createKeyPairSignerFromBytes(bytes);
    console.log(`merchant: ${merchant.address}\nbase: ${BASE}\n`);

    // Negative: protected route without a token.
    const noAuth = await fetch(`${BASE}/api/v1/plans`);
    check('GET /plans without token -> 401', noAuth.status === 401, noAuth.status);

    // 1. nonce
    const nonceRes = await fetch(`${BASE}/api/v1/auth/nonce`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: merchant.address }),
    });
    const { message, nonceToken } = (await nonceRes.json()) as { message: string; nonceToken: string };
    check('POST /auth/nonce -> message + nonceToken', Boolean(message && nonceToken));

    // 2. sign the message
    const messageBytes = new TextEncoder().encode(message);
    const signed = await merchant.signMessages([{ content: messageBytes, signatures: {} }]);
    const sigBytes = signed[0]?.[merchant.address];
    if (!sigBytes) throw new Error('failed to sign message');
    const signature = getBase58Decoder().decode(sigBytes);

    // 3. verify -> session token
    const verifyRes = await fetch(`${BASE}/api/v1/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: merchant.address, message, signature, nonceToken }),
    });
    const verifyBody = (await verifyRes.json()) as { token?: string };
    check('POST /auth/verify -> token', verifyRes.ok && Boolean(verifyBody.token), verifyBody);
    const token = verifyBody.token;
    if (!token) {
        console.error('\nno session token; aborting');
        process.exit(1);
    }

    // Negative: tampered signature must be rejected.
    const badVerify = await fetch(`${BASE}/api/v1/auth/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            address: merchant.address,
            message,
            signature: signature.slice(2),
            nonceToken,
        }),
    });
    check('POST /auth/verify with bad signature -> 401', badVerify.status === 401, badVerify.status);

    const auth = { authorization: `Bearer ${token}` };

    const plans = await (await fetch(`${BASE}/api/v1/plans`, { headers: auth })).json();
    check('GET /plans -> array', Array.isArray(plans.plans), plans);
    console.log(`   plans: ${plans.plans?.length ?? 0}`);

    const subs = await (await fetch(`${BASE}/api/v1/subscriptions`, { headers: auth })).json();
    check('GET /subscriptions -> array', Array.isArray(subs.subscriptions));
    console.log(`   subscriptions: ${subs.subscriptions?.length ?? 0}`);

    const charges = await (await fetch(`${BASE}/api/v1/charges`, { headers: auth })).json();
    check('GET /charges -> array', Array.isArray(charges.charges));
    console.log(`   charges: ${charges.charges?.length ?? 0}`);

    const metricsRes = await (await fetch(`${BASE}/api/v1/metrics`, { headers: auth })).json();
    const m = metricsRes.metrics;
    check(
        'GET /metrics -> shape',
        m && typeof m.mrr === 'string' && typeof m.activeSubscribers === 'number',
        m,
    );
    console.log(
        `   MRR=${m?.mrr} active=${m?.activeSubscribers} churn=${m?.churnRate?.toFixed?.(3)} rev30d=${m?.revenueLast30d}`,
    );

    // Webhook endpoint lifecycle.
    const created = await fetch(`${BASE}/api/v1/webhook-endpoints`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth },
        body: JSON.stringify({ url: 'https://example.com/kairos-webhook' }),
    });
    const createdBody = (await created.json()) as { id?: number; secret?: string };
    check('POST /webhook-endpoints -> id + secret', created.status === 201 && Boolean(createdBody.secret));

    const listed = await (await fetch(`${BASE}/api/v1/webhook-endpoints`, { headers: auth })).json();
    const hasNoSecret = (listed.endpoints ?? []).every((e: Record<string, unknown>) => !('secret' in e));
    check('GET /webhook-endpoints -> list without secrets', Array.isArray(listed.endpoints) && hasNoSecret);

    const deleted = await fetch(`${BASE}/api/v1/webhook-endpoints?id=${createdBody.id}`, {
        method: 'DELETE',
        headers: auth,
    });
    check('DELETE /webhook-endpoints?id -> ok', deleted.ok, deleted.status);

    console.log(`\n${failures === 0 ? '✔ all API checks passed' : `✗ ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
