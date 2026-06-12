# Week 1 — Project kickoff: live lifecycle on devnet

**TL;DR: kairos exists, and the full subscription lifecycle already runs
end-to-end against the live Subscriptions program on devnet — including a
charge executed by a third-party "billing service" key.**

## What shipped

- **Monorepo scaffold** (pnpm + TypeScript strict + Biome + CI): `packages/core`
  (shared program layer), `apps/worker` (future indexer/scheduler), `apps/web`
  (future dashboard). MIT licensed, same as the upstream program.
- **Devnet environment in one command** — `pnpm setup:devnet` generates
  merchant/subscriber/puller keypairs, funds them, and creates a 6-decimal
  test mint (devUSDC).
- **Lifecycle smoke test** — `pnpm demo:lifecycle` runs against the live
  program: `createPlan` (5 devUSDC / 1h period) → `initSubscriptionAuthority`
  → `subscribe` → `transferSubscription` *executed by the puller key* →
  expected-failure second charge → `cancelSubscription` → `resumeSubscription`.
  Every step prints an explorer link.

## What we learned (full notes: [`docs/notes/program-semantics.md`](../docs/notes/program-semantics.md))

- The first charge is allowed **immediately after subscribe**; the per-period
  rule is an **amount cap** (error 400), not a cooldown.
- `cancelSubscription` grants an on-chain **grace period until the end of the
  paid period** (`expiresAt = periodStart + period`); `resume` clears it.
- **Insufficient funds** surfaces as SPL Token error `0x1` and is caught at
  preflight — failed charges cost nothing and leave no on-chain trace, so
  recording them is kairos's job. This is the foundation for dunning.
- The service-puller model is validated: a key listed in the plan's mutable
  `pullers` can charge, while the **immutable `destinations`** guarantee it can
  never redirect funds.
- The official SDK has no event decoders (events are absent from the IDL), so
  the indexer will decode the self-CPI wire format itself — constants already
  live in `@kairos/core`.

## Next week

Phase 1: the event indexer — manual decoders for all six self-CPI events with
fixtures recorded from devnet, cursor-based polling, and idempotent projections
into Postgres.
