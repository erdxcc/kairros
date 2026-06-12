/**
 * Tiny webhook receiver for local demos: prints incoming kairos events and
 * verifies the HMAC signature. Usage:
 *
 *   WEBHOOK_SECRET=<secret> npx tsx scripts/webhook-receiver.ts [port]
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number.parseInt(process.argv[2] ?? '8787', 10);
const secret = process.env.WEBHOOK_SECRET ?? '';
if (!secret) {
    console.warn('WEBHOOK_SECRET not set — signatures will be reported as unverified.');
}

function verify(signatureHeader: string, body: string): boolean {
    if (!secret) return false;
    const parts = Object.fromEntries(
        signatureHeader.split(',').map((kv) => kv.split('=') as [string, string]),
    );
    const timestamp = parts.t;
    const provided = parts.v1;
    if (!timestamp || !provided) return false;
    const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    try {
        return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
        return false;
    }
}

createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', () => {
        const signature = (req.headers['kairos-signature'] as string | undefined) ?? '';
        const verified = verify(signature, body);
        const event = JSON.parse(body || '{}');
        console.log(
            `\n[receiver] ${event.type ?? '?'} (delivery ${req.headers['kairos-delivery'] ?? '?'}) — signature ${verified ? 'VALID ✔' : 'INVALID ✗'}`,
        );
        console.log(JSON.stringify(event.data ?? event, null, 2));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"received":true}');
    });
}).listen(port, () => {
    console.log(`[receiver] listening on http://127.0.0.1:${port}/webhook`);
});
