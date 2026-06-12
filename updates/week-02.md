# Week 2 — The event indexer is live

**TL;DR: kairos now tails the live Subscriptions program on devnet and turns
self-CPI events into queryable billing data — plans, subscriptions, charges —
with crash-safe, gap-free, duplicate-free ingestion. It is already indexing
other teams' devnet activity, not just our own.**

(Also: the project got its name — **kairos**.)

## What shipped

- **Hand-written decoders for all six program events** (`subscriptionCreated`,
  `subscriptionCancelled`, `subscriptionResumed`, `subscriptionTransfer`,
  `fixedTransfer`, `recurringTransfer`). The official SDK exports no event
  decoders — events are absent from the Codama IDL — so kairos decodes the
  Anchor-compatible wire format (8-byte tag + kind byte + packed payload)
  directly from inner-instruction data.
- **Golden-fixture test suite**: raw event bytes recorded from real devnet
  transactions, replayed through the decoders and compared against committed
  golden output. An upstream layout change breaks CI loudly (truncation
  tripwires included) instead of silently corrupting merchant data.
- **Cursor-based polling indexer** in `apps/worker`: `getSignaturesForAddress`
  with a persisted cursor, oldest-first processing, idempotent inserts keyed on
  `(signature, instruction position)`, lazy plan hydration via RPC, and a
  transactional outbox (the foundation webhooks will consume in Phase 2).
- **Database layer**: Drizzle schema + migrations targeting PostgreSQL, with
  embedded **PGlite** for zero-setup local dev (`docker compose up` for the
  real thing). Token amounts stored as `numeric(20,0)` — u64-safe.

## Verified live

- **Kill-and-resume**: the worker was killed mid-backfill, restarted, and
  resumed from the exact cursor — no gaps, no duplicate rows (constraints
  prove it), all six event kinds ingested.
- **Real ecosystem data**: the backfill picked up 21 plans and dozens of
  events from *other* devnet integrators alongside our test merchant —
  multi-merchant indexing works out of the box.
- `pnpm db:stats` snapshot after backfill: 55 events across all six kinds,
  21 plans (18 active / 3 sunset), subscriptions with correct
  active/cancelled statuses, 26 succeeded charges, populated outbox.

## Next week

Phase 2: the REST API + the billing engine — SIWS wallet auth, plan/subscriber/
charge endpoints, the scheduler that auto-pulls due payments with the service
puller key, failed-charge recording, and minimal HMAC-signed webhooks consuming
the outbox.
