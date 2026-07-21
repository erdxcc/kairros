# The merchant API

kairos has a wallet-authenticated REST API. Merchants sign in with their Solana
wallet, no passwords involved, and the API serves their plans, subscribers,
charges, MRR and churn metrics, and webhook-endpoint management. Every query is
scoped to the authenticated wallet. Verified end to end: the worker writes
projections, the API reads them and serves them over HTTP with a valid session.

## What shipped

**Sign-In-With-Solana auth.** `POST /auth/nonce` issues a SIWS message bound to
a short-lived, server-signed nonce. The wallet signs it, and `POST /auth/verify`
checks the Ed25519 signature (the wallet address *is* the public key) plus the
nonce binding, then issues a 24h session JWT. Captured signatures cannot be
replayed past the nonce window, and tampering is rejected.

**Data endpoints** under `/api/v1`, all scoped to the plan owner: `GET /plans`,
`/subscriptions` (with an optional plan filter), `/charges` (succeeded and
failed), `/metrics`, and `/webhook-endpoints` CRUD. The signing secret comes
back exactly once on creation and never on reads. Full spec in
[`../api.md`](../api.md).

**Metrics.** MRR (every active subscription normalized to a monthly figure and
summed), active subscribers, 30-day churn, revenue, and a daily revenue series.
All computed in SQL straight off the projections, so the dashboard stays fast
and never touches RPC.

**A Next.js App Router app** in `apps/web` serving the API, with the dashboard
UI landing on top of it in the next phase.

## Verified

- **8 integration tests** on in-memory PGlite covering the SIWS signature and
  nonce logic, session round-trips, per-merchant scoping (merchant A never sees
  merchant B's rows), and the metrics math.
- **A live HTTP smoke test** (`pnpm --filter @kairos/web api:smoke`): the full
  sign-in flow with the devnet merchant key, then every endpoint with the
  session token, against a running server backed by a database the worker had
  just populated. 4 plans, 4 subscriptions, 7 charges, computed MRR and revenue.
  The negative checks pass too: no token gives 401, a bad signature gives 401,
  and secrets are absent from list responses.

## Engineering notes

The API and the worker share one database. PGlite is single-process and does not
run inside the Next.js server bundle, so the shared and production path uses
Postgres (a free Neon database or docker-compose). The worker on its own still
runs on zero-setup PGlite. `pnpm db:migrate` sets up any Postgres URL.

On-chain wallet keys double as API identities. Multi-merchant support comes for
free, and there are no passwords or accounts to manage.
