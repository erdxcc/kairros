# kairos

**Open-source merchant billing layer for the native Solana Subscriptions program.**

The [Solana Subscriptions & Allowances program](https://github.com/solana-program/subscriptions)
(mainnet, June 2026, audited by Cantina/Spearbit) is the on-chain *engine* for recurring payments:
subscription plans, recurring delegations, and fixed allowances. It is deliberately not a product —
there is no dashboard, no failed-payment handling, no webhooks, no checkout.

kairos is that missing product layer — what Stripe Billing provides on top of a card network:

- 📊 **Merchant dashboard** — subscribers, MRR, churn, payment history
- ⚙️ **Automatic billing** — a scheduler that pulls due payments via the program's `pullers` mechanism
- 🪝 **Webhooks** — HMAC-signed events so your backend can react to subscription activity
- 🔁 **Dunning** — retries, grace periods, and statuses for failed charges *(roadmap)*
- 🧩 **"Subscribe with Solana" checkout & widget** — hosted checkout and an embeddable button *(roadmap)*
- 🔔 **Subscriber notifications** — Telegram alerts for upcoming and failed charges *(roadmap)*

kairos is fully open source (MIT), self-hostable, and built to accelerate adoption of the
Foundation's native primitive — not to compete with it. It never wraps or forks the on-chain
program; it is a pure client-side layer.

## Status

🚧 **Early development — devnet MVP in progress.** Follow the build in [`/updates`](./updates).

| Component | Status |
| --- | --- |
| Devnet lifecycle smoke test | ✅ done |
| Event indexer | ✅ done (cursor-based polling, all six events, golden-fixture tests) |
| Billing scheduler (auto-charge via puller key) | ✅ done (verified live on devnet) |
| Webhooks (HMAC-signed, retries) | ✅ core done ([docs](./docs/webhooks.md)); delivery UI in a later milestone |
| Reconciler (on-chain drift repair) | ✅ done |
| REST API (Sign-In-With-Solana auth) | ✅ done ([docs](./docs/api.md)) |
| Merchant dashboard | 🔨 in progress (Overview, Plans, Subscribers, Payments, Settings) |
| Dunning, checkout widget, Telegram notifications | 🗺️ roadmap |

## Repository layout

```
packages/core    Shared layer: program constants, event decoders, billing rules, db, config
apps/worker      Indexer + billing scheduler + webhook dispatcher + reconciler (one process)
apps/web         Merchant REST API + dashboard (Next.js App Router)
docs/            Integration notes and research
updates/         Weekly build updates
```

## Quickstart (devnet)

Prerequisites: Node.js >= 20.18, pnpm 9, the [Solana CLI](https://solana.com/docs/intro/installation)
configured for devnet with a funded keypair.

```bash
pnpm install
cp .env.example .env        # adjust RPC URL if you have a Helius/other endpoint
pnpm setup:devnet           # generates merchant/subscriber/puller keys, creates a test mint
pnpm demo:lifecycle         # createPlan → subscribe → charge → cancel → resume, end to end
```

## Indexer quickstart

The worker tails the live program and projects events into Postgres
(or embedded [PGlite](https://pglite.dev/) — no database setup needed for dev):

```bash
pnpm worker:dev             # starts the indexer; backfills, then polls every 8s
pnpm db:stats               # summary: events by kind, plans, subscriptions, charges
```

Reliability model: cursor-based `getSignaturesForAddress` polling with
idempotent inserts — kill the worker at any point and restart it; it resumes
from the exact signature it stopped at, with no gaps and no duplicates. Event
decoders are locked by golden fixtures recorded from real devnet transactions
(`packages/core/test/fixtures`), so an upstream wire-format change fails CI
instead of silently corrupting data.

## Merchant API quickstart

The REST API (Next.js App Router, under `/api/v1`) authenticates merchants with
[Sign-In-With-Solana](./docs/api.md) and serves their plans, subscribers,
charges, MRR/churn metrics, and webhook-endpoint management — all scoped to the
authenticated wallet (the plan owner). It reads the projections the worker
maintains, so it never hits RPC.

The API and the worker share one database. PGlite is single-process, so the
shared setup uses **Postgres** (a free [Neon](https://neon.tech) database or
`docker compose up -d`):

```bash
export DATABASE_URL=postgres://...        # Neon or local Postgres
pnpm db:migrate                           # create the schema
pnpm --filter @kairos/web build && pnpm --filter @kairos/web start   # API on :3000
pnpm --filter @kairos/web api:smoke       # full Sign-In-With-Solana flow + every endpoint
```

(The worker alone still runs on zero-setup PGlite; Postgres is only needed when
the API and worker share a database.)

## Merchant dashboard

The same Next.js app serves the merchant dashboard at `/` (Tailwind, TanStack
Query). Sign in by signing a message with a Solana wallet (Phantom, Solflare, …)
via the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) —
no passwords, no transaction. From there: **Overview** (MRR, active subscribers,
churn, a 30-day revenue chart), **Plans**, **Subscribers**, **Payments** (with
Explorer links), and **Settings** (the puller key to add to your plans, plus
webhook endpoints). It runs against the same `DATABASE_URL` as the API:

```bash
pnpm --filter @kairos/web dev     # dashboard + API on http://localhost:3000
```

## On-chain program

| | |
| --- | --- |
| Program | [`solana-program/subscriptions`](https://github.com/solana-program/subscriptions) |
| Program ID | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` (mainnet & devnet) |
| SDK | [`@solana/subscriptions`](https://www.npmjs.com/package/@solana/subscriptions) on `@solana/kit` |

## License

[MIT](./LICENSE)
