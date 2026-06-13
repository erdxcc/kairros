# Week 5 — The merchant dashboard

**TL;DR: kairos now has a dashboard. Merchants sign in with their Solana wallet
(no passwords, no transaction) and land on an Overview of MRR, active
subscribers, churn, and a 30-day revenue chart, with full Plans, Subscribers,
Payments, and Settings pages on top of last week's REST API. It builds, type-checks,
and lints clean; live data and the in-browser wallet handshake are the next thing
to exercise end-to-end.**

## What shipped

- **Wallet sign-in (browser).** The dashboard enumerates installed wallets via
  the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
  connects, and signs the server's SIWS message with the `solana:signMessage`
  feature — no legacy web3.js. The signature is base58-encoded with
  `@solana/kit` and handed to the existing `/auth/verify`, which returns the
  session JWT. The session lives in `localStorage`; a 401 anywhere clears it and
  drops back to the sign-in screen.
- **Five pages**, all reading the merchant-scoped API through TanStack Query:
  - **Overview** — MRR, active subscribers, 30-day churn, 30-day revenue, a
    hand-rolled SVG revenue area chart, and recent payments.
  - **Plans** — each plan with price, cadence, active-subscriber count, status.
  - **Subscribers** — billing status, period progress, expiry, filterable by plan.
  - **Payments** — every charge: successful transfers link to the Explorer,
    failed pulls show their error code.
  - **Settings** — the puller key to add to a plan's `pullers`, plus webhook
    endpoint management (the signing secret is revealed exactly once on creation).
- **Design system.** A small, dependency-light component layer (cards, tables,
  badges, stat cards, empty/loading/error states) on Tailwind v4 in a calm dark
  theme. Every list has explicit loading, empty, and error states.

## Verified

- `pnpm lint` (Biome, 84 files), `pnpm typecheck` (3 packages), and `pnpm test`
  (34 tests) are clean, and `pnpm build` produces an optimized Next.js build —
  5 dashboard routes + 9 API routes.

## Honest status

Two things need a real environment to exercise end-to-end, and both are queued:

- **Live data** needs Postgres (the API and worker share one database, and PGlite
  is single-process). Point `DATABASE_URL` at a free Neon database, run
  `pnpm db:migrate`, start the worker, and the dashboard renders live devnet
  projections.
- **The wallet handshake** is written against the documented Wallet Standard API
  but needs a browser with a real wallet extension (Phantom/Solflare) to confirm —
  it can't be driven headlessly.

## Next

Wire the dashboard to a live Postgres-backed worker for the end-to-end demo
(clean wallet → plan → subscription → auto-charge → all of it on screen), then
Phase 4: demo polish, screenshots, and the grant application.
