# Week 4 — The merchant REST API (Sign-In-With-Solana)

**TL;DR: kairos now has a wallet-authenticated REST API. Merchants sign in with
their Solana wallet (no passwords), and the API serves their plans, subscribers,
charges, MRR/churn metrics, and webhook-endpoint management — every query scoped
to the authenticated wallet. Verified live end-to-end: the worker writes
projections, the API reads and serves them over HTTP with a valid SIWS session.**

## What shipped

- **Sign-In-With-Solana auth.** `POST /auth/nonce` issues a SIWS message bound
  to a short-lived, server-signed nonce; the wallet signs it; `POST /auth/verify`
  checks the Ed25519 signature (the wallet address *is* the public key) and the
  nonce binding, then issues a 24h session JWT. Captured signatures can't be
  replayed past the nonce window, and tampering is rejected.
- **Data endpoints** under `/api/v1`, all merchant-scoped to the plan owner:
  `GET /plans`, `/subscriptions` (optional plan filter), `/charges` (succeeded +
  failed), `/metrics`, and `/webhook-endpoints` CRUD (the signing secret is
  returned exactly once; never on reads). Spec in
  [`docs/api.md`](../docs/api.md).
- **Metrics**: MRR (every active subscription normalized to a monthly figure and
  summed), active subscribers, 30-day churn, revenue, and a daily revenue series
  — computed in SQL straight off the projections, so the dashboard stays fast and
  never touches RPC.
- **Next.js App Router** app in `apps/web` serving the API; the dashboard UI
  lands on top next phase.

## Verified

- **8 integration tests** (in-memory PGlite) cover the SIWS signature/nonce
  logic, session round-trips, per-merchant scoping (merchant A never sees B's
  rows), and the metrics math.
- **Live HTTP smoke** (`pnpm --filter @kairos/web api:smoke`): the full
  sign-in flow with the devnet merchant key, then every endpoint with the
  session token, against a running server backed by a database the **worker had
  just populated** — 4 plans, 4 subscriptions, 7 charges, computed MRR/revenue.
  Negative checks pass too (no token → 401, bad signature → 401, secrets absent
  from list responses).

## Engineering notes

- The API and worker share one database. PGlite is single-process and doesn't
  run inside the Next.js server bundle, so the shared/production path uses
  **Postgres** (free Neon or docker-compose); the worker alone still runs on
  zero-setup PGlite. `pnpm db:migrate` sets up any Postgres URL.
- On-chain wallet keys double as API identities — multi-merchant is free, and
  there are no passwords or accounts to manage.

## Next

The merchant dashboard UI (Overview with MRR/churn, Plans, Subscribers,
Payments, Settings) on top of this API — the face of the MVP demo.
