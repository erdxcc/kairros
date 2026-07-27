export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON.stringify that tolerates BigInt values (renders them as strings). */
export function stringifySafe(value: unknown): string {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

/** Flattens an Error cause-chain into one readable string. */
export function errorChain(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
        parts.push(current.message);
        current = current.cause;
    }
    return parts.length > 0 ? parts.join(' <- ') : String(error);
}

/**
 * Recognises an HTTP 429 in an error chain without matching "429" wherever it
 * happens to appear. Base58 signatures and addresses are full of digits, and a
 * bare substring test turns any of them into a spurious rate-limit retry.
 */
function isRateLimitError(message: string): boolean {
    if (/too many requests/i.test(message)) return true;
    // "429" only when it reads as a status: "status 429", "HTTP 429", "429:".
    return /(?:^|[^0-9])(?:status(?:\s*code)?|code|http)?[\s:=]*\b429\b(?![0-9])/i.test(message)
        ? /(?:status|code|http|error|rate)/i.test(message)
        : false;
}

/** Transport failures that say "the request never got a verdict", not "no". */
const TRANSPORT_ERROR_PATTERNS = [
    /ECONNRESET/,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /ENOTFOUND/,
    /EAI_AGAIN/,
    /EPIPE/,
    /socket hang up/i,
    /network error/i,
    /fetch failed/i,
    /operation was aborted/i,
    /\btimed? ?out\b/i,
];

/**
 * Recognises a failure where the request never completed, as opposed to one
 * where the server answered and the answer was "no". Same care as the 429
 * matcher about bare numbers: base58 signatures are full of digits, so a
 * gateway status only counts when the surrounding text reads like a status.
 */
function isTransportError(message: string): boolean {
    if (TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return true;
    return /(?:^|[^0-9])(?:status(?:\s*code)?|code|http)?[\s:=]*\b(?:502|503|504)\b(?![0-9])/i.test(message)
        ? /(?:status|code|http|error|gateway|unavailable|timeout)/i.test(message)
        : false;
}

export interface RetryOptions {
    /** Total attempts, including the first. */
    attempts?: number;
    /**
     * Also retry transport failures (dropped sockets, DNS blips, 502/503/504),
     * not just HTTP 429.
     *
     * Only correct for idempotent work. A retried read costs one extra RPC
     * call; a retried *write* can put the same transaction on the chain twice,
     * so the money path leaves this off and decides for itself what an
     * unanswered send means.
     */
    retryTransport?: boolean;
}

/**
 * Retries an async action with exponential backoff.
 *
 * HTTP 429 is always retried: a rate limit is explicitly "ask again". Transport
 * failures are retried only under `retryTransport`, because "we never heard
 * back" is safe to repeat for a read and unsafe to repeat for a send. Anything
 * else is rethrown at once — a server that returned a verdict will return the
 * same verdict next time.
 */
export async function withRetry<T>(action: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const attempts = options.attempts ?? 4;
    for (let attempt = 1; ; attempt++) {
        try {
            return await action();
        } catch (error) {
            const message = errorChain(error);
            const rateLimited = isRateLimitError(message);
            const transport = options.retryTransport === true && isTransportError(message);
            if ((!rateLimited && !transport) || attempt >= attempts) throw error;
            const delay = 2000 * 2 ** (attempt - 1);
            console.warn(
                `(${rateLimited ? 'rate limited by RPC' : 'RPC transport failure'}, retrying in ${delay / 1000}s...)`,
            );
            await sleep(delay);
        }
    }
}
