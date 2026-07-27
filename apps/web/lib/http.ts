import { NextResponse } from 'next/server';

/** JSON response that serializes bigint as string (token amounts, timestamps). */
export function json(data: unknown, init?: ResponseInit): NextResponse {
    const body = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    return new NextResponse(body, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
}

export function error(status: number, message: string): NextResponse {
    return json({ error: message }, { status });
}

/** 429 with the Retry-After the client should honour. */
export function tooManyRequests(retryAfterSeconds: number): NextResponse {
    return json(
        { error: 'too many requests' },
        { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
    );
}

/**
 * Wraps a handler so thrown errors become clean 500s instead of HTML pages.
 *
 * The route context is passed straight through, so a dynamic segment can read
 * `ctx.params` instead of picking the value back out of the URL. Handlers that
 * do not need it declare one parameter and ignore the rest.
 */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<NextResponse>) {
    return async (req: Request, ctx: Ctx): Promise<NextResponse> => {
        try {
            return await fn(req, ctx);
        } catch (err) {
            console.error('[api] unhandled error:', err);
            return error(500, 'internal error');
        }
    };
}
