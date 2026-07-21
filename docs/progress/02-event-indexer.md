# The event indexer

kairos tails the live Subscriptions program on devnet and turns self-CPI events
into queryable billing data: plans, subscriptions, charges. Ingestion is
crash-safe, gap-free, and duplicate-free. It indexes other teams' devnet
activity too, not just our own test merchant.

## What shipped

**Hand-written decoders for all six program events**: `subscriptionCreated`,
`subscriptionCancelled`, `subscriptionResumed`, `subscriptionTransfer`,
`fixedTransfer`, `recurringTransfer`. The official SDK exports no event decoders
because events are absent from the Codama IDL, so kairos decodes the
Anchor-compatible wire format (8-byte tag, kind byte, packed payload) directly
from inner-instruction data.

**Golden-fixture tests.** Raw event bytes recorded from real devnet
transactions, replayed through the decoders and compared against committed
golden output. If the upstream layout changes, CI breaks loudly instead of
silently corrupting merchant data. Truncation tripwires are included.

**A cursor-based polling indexer** in `apps/worker`: `getSignaturesForAddress`
with a persisted cursor, oldest-first processing, idempotent inserts keyed on
`(signature, instruction position)`, lazy plan hydration over RPC, and a
transactional outbox that webhooks consume in the next phase.

**The database layer.** Drizzle schema and migrations targeting PostgreSQL, with
embedded [PGlite](https://pglite.dev/) for zero-setup local dev
(`docker compose up` gets you the real thing). Token amounts are stored as
`numeric(20,0)`, which is u64-safe.

## Verified live

- **Kill and resume.** The worker was killed mid-backfill, restarted, and picked
  up from the exact cursor. No gaps, no duplicate rows (the constraints prove
  it), all six event kinds ingested.
- **Real ecosystem data.** The backfill picked up 21 plans and dozens of events
  from other devnet integrators alongside our test merchant, so multi-merchant
  indexing works out of the box.
- **A `pnpm db:stats` snapshot after backfill:** 55 events across all six kinds,
  21 plans (18 active, 3 sunset), subscriptions with correct active and
  cancelled statuses, 26 succeeded charges, and a populated outbox.

## Reliability model

Cursor-based polling with idempotent inserts. Kill the worker at any point and
restart it; it resumes from the exact signature it stopped at. The decoders are
locked by golden fixtures in `packages/core/test/fixtures`, so a wire-format
change upstream fails CI rather than quietly writing bad data.
