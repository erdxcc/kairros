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

/**
 * Retries an async action when the RPC rate-limits us (HTTP 429), with
 * exponential backoff. Anything else is rethrown immediately.
 */
export async function withRetry<T>(action: () => Promise<T>, attempts = 4): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await action();
        } catch (error) {
            const message = errorChain(error);
            const rateLimited = isRateLimitError(message);
            if (!rateLimited || attempt >= attempts) throw error;
            const delay = 2000 * 2 ** (attempt - 1);
            console.warn(`(rate limited by RPC, retrying in ${delay / 1000}s...)`);
            await sleep(delay);
        }
    }
}
