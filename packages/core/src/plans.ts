/**
 * One place that turns an on-chain Plan account into a `plans` row.
 *
 * Two writers touch that table: the indexer fills a row the first time an
 * event references the plan, and the reconciler re-reads it later because
 * `updatePlan` emits no event. They used to map the account independently,
 * and the reconciler mapped fewer fields than the indexer, so a plan whose
 * terms changed kept its original `amount` and `period_hours` forever while
 * the scheduler charged from exactly those two columns. Sharing the mapper is
 * what makes "the projection matches the chain" a property of one function.
 */

/** The 32-byte all-zero pubkey, used on-chain as an empty array slot. */
export const ZERO_ADDRESS = '11111111111111111111111111111111';

/** On-chain PlanStatus: 1 = active, anything else = sunset. */
export const PLAN_STATUS_ACTIVE = 1;

/**
 * Structural view of the SDK's Plan account. Declared by shape rather than
 * imported so a codegen change in `@solana/subscriptions` surfaces as a type
 * error here, at the mapping, instead of somewhere downstream.
 */
export interface PlanAccountLike {
    owner: string;
    status: number;
    data: {
        planId: bigint;
        mint: string;
        endTs: bigint;
        destinations: readonly string[];
        pullers: readonly string[];
        metadataUri: string;
        terms: { amount: bigint; periodHours: bigint; createdAt: bigint };
    };
}

/** Every column of `plans` that is derived from the chain. */
export interface PlanRow {
    planPda: string;
    owner: string;
    planId: string;
    mint: string;
    amount: string;
    periodHours: bigint;
    status: string;
    endTs: bigint;
    destinations: string[];
    pullers: string[];
    metadataUri: string;
    createdAtChain: bigint;
}

/**
 * A placeholder row for a plan whose account could not be read yet.
 *
 * Status `unresolved` (not `closed`) is the whole point: a lagging RPC node
 * that reports a live plan as missing must not produce a row that nothing ever
 * revisits. The reconciler sweeps `unresolved` and fills in the real terms;
 * only a sweep that confirms the account is genuinely gone writes `closed`.
 * `owner` is empty, which matches no wallet, so the row stays invisible to
 * merchants until it is resolved rather than showing up under the wrong one.
 */
export function unresolvedPlanRow(planPda: string): PlanRow {
    return {
        planPda,
        owner: '',
        planId: '0',
        mint: '',
        amount: '0',
        periodHours: 0n,
        status: 'unresolved',
        endTs: 0n,
        destinations: [],
        pullers: [],
        metadataUri: '',
        createdAtChain: 0n,
    };
}

/** Maps a fetched Plan account onto its row, dropping empty array slots. */
export function planRowFromAccount(planPda: string, account: PlanAccountLike): PlanRow {
    const { data } = account;
    return {
        planPda,
        owner: account.owner,
        planId: data.planId.toString(),
        mint: data.mint,
        amount: data.terms.amount.toString(),
        periodHours: data.terms.periodHours,
        status: account.status === PLAN_STATUS_ACTIVE ? 'active' : 'sunset',
        endTs: data.endTs,
        destinations: data.destinations.filter((d) => d !== ZERO_ADDRESS),
        pullers: data.pullers.filter((p) => p !== ZERO_ADDRESS),
        metadataUri: data.metadataUri,
        createdAtChain: data.terms.createdAt,
    };
}
