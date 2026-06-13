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

- **Craft pass.** A design-quality sweep over the whole dashboard: brand-color
  focus rings on every interactive element, larger hit targets on icon buttons,
  `font-mono tabular-nums` on every money value so digits never jitter, an amber
  (not green) devnet indicator, a three-state wallet flow ("Connecting…"), wallet
  rejection treated as a quiet return-to-idle rather than an error, an AA-contrast
  bump on secondary text, and a global `prefers-reduced-motion` guard.

## Verified — now live on Postgres

The whole stack ran end to end on a free **Neon** database:

- `pnpm db:migrate` created the schema on Neon; the worker indexed live devnet
  activity into it, then a full `demo:lifecycle` (createPlan → subscribe → a real
  5-devUSDC charge → cancel → resume) was projected in.
- Signed in as the devnet merchant, the API served **its** real data over HTTP:
  1 plan, 1 active subscriber, 1 succeeded charge, MRR and 30-day revenue computed
  from the projections — all while the worker wrote to the same database
  concurrently (the multi-process case embedded PGlite can't handle).
- `pnpm lint` (Biome, 84 files), `pnpm typecheck` (3 packages), `pnpm test`
  (34 tests), and `pnpm build` (5 dashboard routes + 9 API routes) are clean.

## Honest status

- **Live data path: done** — worker → Neon → dashboard, verified with real devnet
  projections.
- **The in-browser wallet handshake** is written against the documented Wallet
  Standard API but still needs a browser with a real wallet extension
  (Phantom/Solflare) to confirm; it can't be driven headlessly.

## Next

Phase 4: a clean end-to-end demo recording (wallet → plan → subscription →
auto-charge on screen), screenshots, and the grant application.
