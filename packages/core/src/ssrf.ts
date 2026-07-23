/**
 * SSRF guard for server-side webhook delivery.
 *
 * Merchants register arbitrary webhook URLs and the worker later POSTs signed
 * payloads to them. Without a guard, a merchant could point an endpoint at
 * cloud metadata (169.254.169.254), loopback, or internal services and turn the
 * worker into a blind-SSRF proxy. `assertSafeWebhookUrl` enforces https, no
 * embedded credentials, and (crucially) rejects any host that resolves to a
 * private / reserved address.
 *
 * The check runs both at registration (fast feedback) and immediately before
 * each delivery (the real trust boundary: DNS may re-point between the two).
 * A small residual DNS-rebind window remains between this resolve and fetch's
 * own resolve; closing it fully requires pinning the connection to the vetted
 * IP, which is left as a follow-up.
 *
 * Local development points webhooks at http://127.0.0.1; set
 * KAIROS_WEBHOOK_ALLOW_PRIVATE=1 to opt out of the guard for that (dev only).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeWebhookUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeWebhookUrlError';
    }
}

export interface WebhookUrlGuardOptions {
    /** Dev-only escape hatch: permit http: and private / loopback addresses. */
    allowPrivate?: boolean;
}

/** True when the KAIROS_WEBHOOK_ALLOW_PRIVATE dev override is enabled. */
export function webhookAllowPrivate(): boolean {
    return process.env.KAIROS_WEBHOOK_ALLOW_PRIVATE === '1';
}

function ipv4ToBytes(ip: string): number[] | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    const bytes: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const n = Number(part);
        if (n > 255) return null;
        bytes.push(n);
    }
    return bytes;
}

/** IPv4 ranges that must never be reachable from a server-side fetch. */
function isPrivateIpv4Bytes(b: number[]): boolean {
    const a = b[0] ?? 0;
    const second = b[1] ?? 0;
    const third = b[2] ?? 0;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 100 && second >= 64 && second <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 169 && second === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
    if (a === 172 && second >= 16 && second <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && second === 0 && third === 0) return true; // 192.0.0.0/24 IETF
    if (a === 192 && second === 0 && third === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && second === 168) return true; // 192.168.0.0/16 private
    if (a === 198 && (second === 18 || second === 19)) return true; // 198.18.0.0/15 benchmark
    if (a === 198 && second === 51 && third === 100) return true; // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && second === 0 && third === 113) return true; // 203.0.113.0/24 TEST-NET-3
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
    return false;
}

/** Expands any valid IPv6 literal (incl. embedded IPv4) to its 16 bytes. */
function ipv6ToBytes(ip: string): number[] | null {
    let s = ip;
    const zone = s.indexOf('%');
    if (zone >= 0) s = s.slice(0, zone);

    // Rewrite a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
    if (s.includes('.')) {
        const idx = s.lastIndexOf(':');
        if (idx < 0) return null;
        const v4 = ipv4ToBytes(s.slice(idx + 1));
        if (!v4) return null;
        const h1 = (((v4[0] ?? 0) << 8) | (v4[1] ?? 0)).toString(16);
        const h2 = (((v4[2] ?? 0) << 8) | (v4[3] ?? 0)).toString(16);
        s = `${s.slice(0, idx + 1)}${h1}:${h2}`;
    }

    const halves = s.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ?? '';
    const tail = halves[1] ?? '';
    const left = head === '' ? [] : head.split(':');
    const right = halves.length === 2 ? (tail === '' ? [] : tail.split(':')) : [];
    let groups: string[];
    if (halves.length === 2) {
        const missing = 8 - left.length - right.length;
        if (missing < 0) return null;
        groups = [...left, ...Array(missing).fill('0'), ...right];
    } else {
        groups = left;
    }
    if (groups.length !== 8) return null;

    const bytes: number[] = [];
    for (const group of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
        const n = Number.parseInt(group, 16);
        bytes.push((n >> 8) & 0xff, n & 0xff);
    }
    return bytes;
}

/** IPv6 ranges that must never be reachable from a server-side fetch. */
function isPrivateIpv6Bytes(b: number[]): boolean {
    const b0 = b[0] ?? 0;
    const b1 = b[1] ?? 0;
    const b2 = b[2] ?? 0;
    const b3 = b[3] ?? 0;
    const b10 = b[10] ?? 0;
    const b11 = b[11] ?? 0;
    const b15 = b[15] ?? 0;
    if (b.every((x) => x === 0)) return true; // :: unspecified
    if (b.slice(0, 15).every((x) => x === 0) && b15 === 1) return true; // ::1 loopback
    // ::ffff:0:0/96 IPv4-mapped -> classify the embedded IPv4.
    if (b.slice(0, 10).every((x) => x === 0) && b10 === 0xff && b11 === 0xff) {
        return isPrivateIpv4Bytes(b.slice(12, 16));
    }
    // 64:ff9b::/96 NAT64 -> classify the embedded IPv4.
    if (b0 === 0x00 && b1 === 0x64 && b2 === 0xff && b3 === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
        return isPrivateIpv4Bytes(b.slice(12, 16));
    }
    if ((b0 & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
    if (b0 === 0xfe && (b1 & 0xc0) === 0x80) return true; // fe80::/10 link-local
    if (b0 === 0xff) return true; // ff00::/8 multicast
    return false;
}

/**
 * True when `ip` (an IPv4 or IPv6 literal) is private, loopback, link-local, or
 * otherwise reserved. Anything that does not parse as an IP is treated as unsafe
 * so callers fail closed.
 */
export function isPrivateIp(ip: string): boolean {
    const kind = isIP(ip);
    if (kind === 4) {
        const bytes = ipv4ToBytes(ip);
        return bytes ? isPrivateIpv4Bytes(bytes) : true;
    }
    if (kind === 6) {
        const bytes = ipv6ToBytes(ip);
        return bytes ? isPrivateIpv6Bytes(bytes) : true;
    }
    return true;
}

/**
 * Validates a merchant-supplied webhook URL for server-side delivery. Returns
 * the parsed URL, or throws `UnsafeWebhookUrlError`. Rejects non-https URLs,
 * embedded credentials, and any host that resolves to a private / reserved
 * address (all resolved records must be public).
 */
export async function assertSafeWebhookUrl(raw: string, opts: WebhookUrlGuardOptions = {}): Promise<URL> {
    const allowPrivate = opts.allowPrivate ?? false;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new UnsafeWebhookUrlError('url is not a valid URL');
    }

    const httpAllowed = allowPrivate && url.protocol === 'http:';
    if (url.protocol !== 'https:' && !httpAllowed) {
        throw new UnsafeWebhookUrlError('url must use https');
    }
    if (url.username !== '' || url.password !== '') {
        throw new UnsafeWebhookUrlError('url must not contain credentials');
    }
    if (allowPrivate) return url;

    const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (isIP(host)) {
        if (isPrivateIp(host)) {
            throw new UnsafeWebhookUrlError(`url points at a private address (${host})`);
        }
        return url;
    }

    let resolved: Array<{ address: string }>;
    try {
        resolved = await lookup(host, { all: true, verbatim: true });
    } catch {
        throw new UnsafeWebhookUrlError(`url host does not resolve (${host})`);
    }
    if (resolved.length === 0) {
        throw new UnsafeWebhookUrlError(`url host does not resolve (${host})`);
    }
    for (const { address } of resolved) {
        if (isPrivateIp(address)) {
            throw new UnsafeWebhookUrlError(`url resolves to a private address (${address})`);
        }
    }
    return url;
}
