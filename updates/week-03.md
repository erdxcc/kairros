# Week 3 — Automatic billing is live (and so are webhooks)

**TL;DR: kairos now charges subscriptions automatically with its own billing
key and notifies merchant backends with HMAC-signed webhooks. Verified live
on devnet end-to-end: subscribe → auto-charge ~60s later → `charge.succeeded`
delivered with a valid signature. A real `charge.failed` (insufficient funds)
fired too — the dunning foundation works.**

## What shipped

- **Billing scheduler** (`apps/worker/src/scheduler.ts`): finds due
  subscriptions on plans that authorize the kairos puller key, rechecks state
  against the chain, and executes `transferSubscription`. Success is *never*
  recorded directly — the on-chain event comes back through the indexer, so
  the chain stays the single source of truth for money movement. Failures
  (which never reach the chain — preflight catches them for free) are
  recorded off-chain with a classified `failureKind` and emit `charge.failed`.
- **`PullerSigner` interface** (`packages/core/src/puller.ts`): the scheduler
  is key-storage-agnostic. Devnet uses an env keypair; the mainnet milestone
  swaps in KMS without touching billing logic. Even a leaked puller key cannot
  redirect funds — the program's immutable `destinations` and period caps see
  to that.
- **Webhook dispatcher**: transactional outbox → per-endpoint delivery rows →
  Stripe-style HMAC-signed POSTs (`kairos-signature: t=...,v1=...`), 5
  attempts with 30s→6h backoff, full delivery log. Spec + verification snippet
  in [`docs/webhooks.md`](../docs/webhooks.md).
- **Reconciler**: hourly sweep re-reading every projected plan/subscription
  account via batched `getMultipleAccounts`. Critical because `updatePlan`
  emits no event — status/puller changes are only visible in account state.
- **Pure billing rules with unit tests**: due-check (first charge at
  subscribe, renewals at period boundaries, never during cancellation grace)
  and failure classification (insufficient funds vs. period cap vs. terminal)
  — 26 tests green.

## Verified live on devnet

1. Created a plan whose `pullers` include the kairos billing key; subscribed
   **without charging**.
2. Started the worker: the indexer ingested `subscriptionCreated`, the
   scheduler picked the subscription up and charged 5 devUSDC about a minute
   later — zero human involvement.
3. A local receiver got `subscription.created` and `charge.succeeded` with
   **valid HMAC signatures**, plus the merchant's full event backlog.
4. Bonus, unplanned: the scheduler found an old test subscription priced above
   the subscriber's balance, preflight rejected it, and a `charge.failed`
   webhook with `failureKind: "insufficient_funds"` was delivered — exactly
   the signal dunning will consume.

## Next

The merchant REST API with Sign-In-With-Solana auth (plans, subscribers,
charges, MRR/churn metrics, webhook endpoint management) — the layer the
dashboard will sit on.
