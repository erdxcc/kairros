/**
 * In-process rate limiting for the unauthenticated auth endpoints.
 *
 * `/auth/nonce` mints a signed token and `/auth/verify` runs an Ed25519
 * verification, both without any credential to throttle against, so anything
 * that can reach them can make this server do asymmetric crypto in a loop.
 *
 * Scope, stated plainly: this is a fixed-window counter in process memory. It
 * is per instance, so N instances allow N times the limit, and it resets on
 * deploy. That is the correct trade for the abuse it addresses — a single
 * source hammering one box — and the wrong tool for a distributed attack,
 * which needs a shared store (Redis) or an edge rule. It is here because "no
 * limit at all" is not a defensible starting point, not because it is the
 * finished one.
 */

export interface RateLimitOptions {
    /** Requests permitted per window, per key. */
    limit: number;
    windowMs: number;
}

export interface RateLimitResult {
    ok: boolean;
    /** Requests left in this window. */
    remaining: number;
    /** Seconds until the window resets; for the Retry-After header. */
    retryAfterSeconds: number;
}

interface Counter {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Counter>();

/** Bounds memory: a flood of distinct keys must not grow the map forever. */
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number): void {
    for (const [key, counter] of buckets) {
        if (counter.resetAt <= now) buckets.delete(key);
    }
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    let counter = buckets.get(key);

    if (!counter || counter.resetAt <= now) {
        if (buckets.size >= MAX_TRACKED_KEYS) sweep(now);
        // Still full of live windows: shed rather than grow without bound.
        if (buckets.size >= MAX_TRACKED_KEYS) {
            return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil(opts.windowMs / 1000) };
        }
        counter = { count: 0, resetAt: now + opts.windowMs };
        buckets.set(key, counter);
    }

    counter.count++;
    const retryAfterSeconds = Math.max(1, Math.ceil((counter.resetAt - now) / 1000));
    if (counter.count > opts.limit) {
        return { ok: false, remaining: 0, retryAfterSeconds };
    }
    return { ok: true, remaining: opts.limit - counter.count, retryAfterSeconds };
}

/** Test seam: drops all counters. */
export function resetRateLimits(): void {
    buckets.clear();
}

/**
 * Best-effort client identity for rate limiting.
 *
 * `x-forwarded-for` is only meaningful behind a proxy that sets it; a client
 * can otherwise send whatever it likes. Set TRUSTED_PROXY=1 when the app runs
 * behind one (Vercel, a load balancer, nginx) — the leftmost entry is then the
 * real client. Without it the header is ignored, which degrades the limiter to
 * a global one rather than letting a forged header hand out fresh quota per
 * request.
 */
export function clientKey(req: Request): string {
    if (process.env.TRUSTED_PROXY === '1') {
        const forwarded = req.headers.get('x-forwarded-for');
        const first = forwarded?.split(',')[0]?.trim();
        if (first) return first;
        const realIp = req.headers.get('x-real-ip')?.trim();
        if (realIp) return realIp;
    }
    return 'unproxied';
}
