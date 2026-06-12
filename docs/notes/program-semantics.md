# Subscriptions Program Semantics — Phase 0 Spike Findings

Verified empirically against the **live devnet deployment** of
`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` on 2026-06-12, using
`@solana/subscriptions@0.3.0` on `@solana/kit@6.9.0`.
Reproduce with `pnpm setup:devnet && pnpm demo:lifecycle` and
`npx tsx packages/core/scripts/probe-insufficient-funds.ts`.

## Billing period & charge timing

- **The first charge is allowed immediately after `subscribe`.** The
  subscription's `currentPeriodStartTs` is set to the `subscribe` transaction's
  block time, and the full plan amount can be pulled right away. Period 1 is
  *paid at its start*, not its end. (Observed: subscribe at `t`, successful
  `transferSubscription` seconds later.)
- **The per-period constraint is an amount cap, not a cooldown.** A second
  full-amount pull inside the same period fails with error **400
  `amountExceedsPeriodLimit`** — *not* 401 `periodNotElapsed`. The program
  tracks `amountPulledInPeriod`; partial pulls that stay within the plan amount
  appear to be allowed (the cap is on the cumulative amount).
  - Scheduler design consequence: a charge for period *N+1* becomes possible
    once `currentPeriodStartTs + periodHours * 3600 <= now`. Idempotency should
    be keyed on the period boundary and cross-checked against the
    `amountPulledInPeriod` value carried by `SubscriptionTransferEvent`.
- `periodHours` is expressed in hours (u64); a 1-hour period worked on devnet,
  which is convenient for fast demos (`PERIOD_HOURS=1`).

## Cancellation & resume

- `cancelSubscription` (subscriber-signed) sets `expiresAtTs` to **exactly the
  end of the current paid period** (`currentPeriodStartTs + periodHours *
  3600`) when the snapshotted terms still match the plan. This is the on-chain
  grace period: the subscription stays serviceable until the period the user
  already paid for runs out.
- `resumeSubscription` clears `expiresAtTs` back to `0` (active). Verified
  cancel → resume round-trip in one period.
- **Only the subscriber can cancel or resume.** The merchant cannot terminate
  an on-chain subscription; merchant-side "cancellation" in kairos means
  *stop charging and flag the subscriber* (dunning `delinquent` state), plus
  optionally sunsetting the plan.

## Failure classification (dunning groundwork)

| Scenario | Error surface | Code | Retryable? |
| --- | --- | --- | --- |
| Charge above remaining period cap | Subscriptions program | `400 amountExceedsPeriodLimit` | No — wait for next period |
| Period not yet elapsed (charge too early) | Subscriptions program | `401 periodNotElapsed` (per IDL; not yet observed) | Yes — at period boundary |
| Subscriber balance too low | **SPL Token CPI**, bubbled up | **`0x1` (custom #1)**, log line `Error: insufficient funds` | Yes — classic dunning retry |
| Subscription cancelled / expired | Subscriptions program | `508 subscriptionCancelled` family | Terminal |

Key operational findings:

- Insufficient funds is **distinguishable** from program-domain errors: the
  custom code is `1` (SPL Token's `InsufficientFunds`) and the log shows the
  Token program frame, while Subscriptions-domain errors use codes 100+.
- **Preflight simulation catches failures before fees are paid.** Both probes
  failed at `Failed to send transaction (preflight)` — the billing worker can
  simulate-then-send and classify failures for free. Failed charge attempts
  therefore leave *no on-chain trace*; recording them is strictly an off-chain
  (kairos database) responsibility.

## SubscriptionAuthority

- One `SubscriptionAuthority` PDA per **(user, token mint)** pair — seeds
  `["SubscriptionAuthority", user, tokenMint]`. Initializing it issues an SPL
  `approve` for `u64::MAX` from the user's ATA to the authority PDA.
- Init is one-time per mint: a second subscription to any plan in the same
  mint skips straight to `subscribe` (verified: the demo's re-run path skips
  init when the PDA exists).
- Wallet-UX note (untested in this spike, needs a browser wallet in Phase 3):
  the `u64::MAX` approve is the step most likely to trigger wallet warnings.
  Checkout copy must explain that actual spending is bounded per-plan-period
  by the program, and that `closeSubscriptionAuthority` / `revokeSubscriptionAuthority`
  is a global kill switch.

## Service-puller architecture — validated

The whole kairos billing model was exercised live: a **third-party keypair**
(the future kairos billing worker key) that is *not* the plan owner, listed in
the plan's mutable `pullers` array (max 4), successfully executed
`transferSubscription`. Funds can only land in ATAs owned by addresses in the
plan's **immutable** `destinations` array (max 4) — a compromised puller key
cannot redirect funds, only trigger charges within period caps.

## SDK / plugin observations (v0.3.0)

- The Kit plugin (`client.subscriptions.instructions.*`) auto-fills the signer
  from client identity, derives PDAs, fetches live plan terms for `subscribe`
  (terms-snapshot consent), and `.sendTransaction()` handles blockhash +
  compute budget (a ComputeBudget instruction is injected automatically).
- `fetchPlan` / `fetchSubscriptionDelegation` decode accounts cleanly; note
  the nesting: `Account<Plan>.data.data` is the `PlanData` (the generated
  `Plan` type wraps a `data: PlanData` field).
- **No event decoders are exported** (events are absent from the Codama IDL).
  The Phase 1 indexer must decode the self-CPI event wire format
  (`[8-byte tag 0x1d9acb512ea545e4 LE][1-byte kind][packed payload]`) itself —
  constants live in `@kairos/core` (`src/program.ts`).
- The public devnet RPC (`api.devnet.solana.com`) rate-limits bursts (HTTP
  429); scripts use bounded retry with backoff. Use a free Helius endpoint in
  `.env` for smoother runs.

## Open questions (deferred, with owners)

1. **Wallet-approval UX** of `initSubscriptionAuthority` in Phantom/Solflare —
   Phase 3 spike (needs a browser).
2. `updatePlan` interaction with existing subscriptions (`planTermsMismatch`
   cancel path) — probe before building plan-editing UI (Phase 3).
3. Exact `periodNotElapsed` (401) trigger conditions — observe once the Phase 2
   scheduler charges across a real period boundary.
4. TransferHook mints: rejected by the deployed program (error 121) but support
   exists in the repo's HEAD — re-check on the program's next release before
   relaxing kairos's mint validation.
