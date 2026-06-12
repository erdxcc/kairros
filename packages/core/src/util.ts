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
 * Retries an async action when the RPC rate-limits us (HTTP 429), with
 * exponential backoff. Anything else is rethrown immediately.
 */
export async function withRetry<T>(action: () => Promise<T>, attempts = 4): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await action();
        } catch (error) {
            const message = errorChain(error);
            const rateLimited = message.includes('429') || message.includes('Too Many Requests');
            if (!rateLimited || attempt >= attempts) throw error;
            const delay = 2000 * 2 ** (attempt - 1);
            console.warn(`(rate limited by RPC, retrying in ${delay / 1000}s...)`);
            await sleep(delay);
        }
    }
}
