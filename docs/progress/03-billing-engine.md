# Automatic billing and webhooks

kairos charges subscriptions on its own, with its own billing key, and tells
merchant backends about it through HMAC-signed webhooks. Verified live on
devnet end to end: subscribe, auto-charge about a minute later, then
`charge.succeeded` delivered with a valid signature. A real `charge.failed` from
insufficient funds fired too, which is the dunning foundation working.

## What shipped

**The billing scheduler** (`apps/worker/src/scheduler.ts`) finds due
subscriptions on plans that authorize the kairos puller key, rechecks their
state against the chain, and executes `transferSubscription`. Success is never
recorded directly. The on-chain event comes back through the indexer instead, so
the chain stays the single source of truth for money movement. Failures never
reach the chain at all (preflight catches them for free), so they are recorded
off-chain with a classified `failureKind` and emit `charge.failed`.

**A `PullerSigner` interface** (`packages/core/src/puller.ts`) keeps the
scheduler agnostic about key storage. Devnet uses an env keypair; the mainnet
milestone swaps in KMS without touching billing logic. Even a leaked puller key
cannot redirect funds, because the program's immutable `destinations` and period
caps see to that.

**The webhook dispatcher.** Transactional outbox, then per-endpoint delivery
rows, then Stripe-style HMAC-signed POSTs (`kairos-signature: t=...,v1=...`).
Five attempts with 30s to 6h backoff and a full delivery log. The spec and a
verification snippet are in [`../webhooks.md`](../webhooks.md).

**The reconciler.** An hourly sweep that re-reads every projected plan and
subscription account with batched `getMultipleAccounts`. This matters because
`updatePlan` emits no event, so status and puller changes are only ever visible
in account state.

**Pure billing rules with unit tests.** The due-check (first charge at
subscribe, renewals at period boundaries, never during a cancellation grace
period) and failure classification (insufficient funds, period cap, terminal).
26 tests green.

## Verified live on devnet

1. Created a plan whose `pullers` include the kairos billing key, then
   subscribed without charging.
2. Started the worker. The indexer ingested `subscriptionCreated`, the scheduler
   picked the subscription up, and it charged 5 devUSDC about a minute later
   with zero human involvement.
3. A local receiver got `subscription.created` and `charge.succeeded` with valid
   HMAC signatures, plus the merchant's full event backlog.
4. Unplanned bonus: the scheduler found an old test subscription priced above
   the subscriber's balance, preflight rejected it, and a `charge.failed`
   webhook with `failureKind: "insufficient_funds"` was delivered. That is
   exactly the signal dunning will consume.
