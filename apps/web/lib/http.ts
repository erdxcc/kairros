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

/** Wraps a handler so thrown errors become clean 500s instead of HTML pages. */
export function handler(fn: (req: Request) => Promise<NextResponse>) {
    return async (req: Request): Promise<NextResponse> => {
        try {
            return await fn(req);
        } catch (err) {
            console.error('[api] unhandled error:', err);
            return error(500, 'internal error');
        }
    };
}
