/**
 * Pure billing logic shared by the scheduler (worker) and, later, the API.
 * Kept side-effect-free so the rules are unit-testable without RPC or DB.
 *
 * Semantics verified on devnet (docs/notes/program-semantics.md):
 *   - Period 1 starts at `subscribe` and is chargeable immediately.
 *   - The program enforces a cumulative amount cap per period (error 400);
 *     a new period's full amount unlocks once periodStart + period elapses
 *     (the program rolls the period forward on transfer).
 *   - A scheduled cancellation (expiresAtTs != 0) means "already paid through
 *     the grace period" — never charge again.
 */

export interface DueCheckInput {
    /** On-chain (or projected) current period start, unix seconds. */
    currentPeriodStartTs: bigint;
    /** Cumulative amount pulled in the current period. */
    amountPulledInPeriod: bigint;
    /** 0 = active; non-zero = cancellation scheduled (grace running). */
    expiresAtTs: bigint;
    /** Plan terms. */
    amount: bigint;
    periodHours: bigint;
}

export type DueKind = 'first-charge' | 'renewal';

/**
 * Returns why a subscription is chargeable right now, or null when it is not.
 */
export function subscriptionDue(input: DueCheckInput, nowTs: bigint): DueKind | null {
    if (input.expiresAtTs !== 0n) return null; // cancellation scheduled — never charge
    if (input.amount <= 0n) return null;
    const periodEnd = input.currentPeriodStartTs + input.periodHours * 3600n;
    if (nowTs >= periodEnd) return 'renewal'; // program rolls the period on transfer
    if (input.amountPulledInPeriod === 0n && nowTs >= input.currentPeriodStartTs) {
        return 'first-charge';
    }
    return null;
}

export type ChargeFailureKind =
    | 'insufficient_funds' // retryable — the classic dunning case
    | 'already_charged' // period cap hit (someone else pulled); not a failure
    | 'not_due' // periodNotElapsed; clock skew — retry next cycle
    | 'subscription_cancelled' // terminal for this subscription
    | 'plan_inactive' // plan sunset/expired/closed
    | 'receiver_ata_missing' // merchant setup problem; actionable
    | 'unknown';

/**
 * Classifies a failed `transferSubscription` from the error message chain.
 * Program-domain errors carry their custom code; SPL Token's insufficient
 * funds bubbles up as custom error 1 with a Token-program log frame.
 */
export function classifyChargeError(message: string): ChargeFailureKind {
    // Two wire formats observed: "Custom program error: #400" (preflight,
    // decimal) and "custom program error: 0x190" (program logs, hex).
    const hex = message.match(/custom program error: 0x([0-9a-fA-F]+)/i);
    const dec = message.match(/custom program error: #(\d+)/i);
    const code =
        hex?.[1] !== undefined
            ? Number.parseInt(hex[1], 16)
            : dec?.[1] !== undefined
              ? Number.parseInt(dec[1], 10)
              : undefined;
    if (code !== undefined) {
        switch (code) {
            case 1:
                return 'insufficient_funds';
            case 400:
                return 'already_charged';
            case 401:
                return 'not_due';
            case 508: // subscriptionCancelled
            case 509: // subscriptionAlreadyCancelled
            case 128: // delegationExpired
                return 'subscription_cancelled';
            case 500: // planSunset
            case 501: // planExpired
            case 516: // planClosed
                return 'plan_inactive';
            default:
                return 'unknown';
        }
    }
    if (/insufficient funds/i.test(message)) return 'insufficient_funds';
    return 'unknown';
}

/** Failures worth a dunning retry (vs. terminal/no-op outcomes). */
export function isRetryableFailure(kind: ChargeFailureKind): boolean {
    return kind === 'insufficient_funds' || kind === 'not_due' || kind === 'unknown';
}
