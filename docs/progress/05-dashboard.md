# The merchant dashboard

kairos has a dashboard. Merchants sign in with their Solana wallet (no
passwords, no transaction) and land on an Overview of MRR, active subscribers,
churn, and a 30-day revenue chart, with full Plans, Subscribers, Payments, and
Settings pages sitting on the REST API from the previous phase.

## What shipped

**Wallet sign-in in the browser.** The dashboard enumerates installed wallets
through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard),
connects, and signs the server's SIWS message with the `solana:signMessage`
feature. No legacy web3.js. The signature is base58-encoded with `@solana/kit`
and handed to the existing `/auth/verify`, which returns the session JWT. The
session lives in `localStorage`, and a 401 anywhere clears it and drops back to
the sign-in screen.

**Five pages**, all reading the merchant-scoped API through TanStack Query:

- **Overview**: MRR, active subscribers, 30-day churn, 30-day revenue, a
  hand-rolled SVG revenue area chart, and recent payments.
- **Plans**: each plan with its price, cadence, active-subscriber count, status.
- **Subscribers**: billing status, period progress, expiry, filterable by plan.
- **Payments**: every charge. Successful transfers link to the Explorer, failed
  pulls show their error code.
- **Settings**: the puller key to add to a plan's `pullers`, plus webhook
  endpoint management. The signing secret is revealed exactly once on creation.

**A design system.** A small, dependency-light component layer (cards, tables,
badges, stat cards, empty and loading and error states) on Tailwind v4 in a calm
dark theme. Every list has explicit loading, empty, and error states.

**A craft pass** over the whole dashboard: brand-color focus rings on every
interactive element, larger hit targets on icon buttons, `font-mono tabular-nums`
on every money value so digits never jitter, an amber rather than green devnet
indicator, a three-state wallet flow with a "Connecting…" step, wallet rejection
treated as a quiet return to idle instead of an error, an AA-contrast bump on
secondary text, and a global `prefers-reduced-motion` guard.

## Verified live on Postgres

The whole stack ran end to end on a free Neon database.

- `pnpm db:migrate` created the schema on Neon. The worker indexed live devnet
  activity into it, then a full `demo:lifecycle` (createPlan, subscribe, a real
  5-devUSDC charge, cancel, resume) was projected in.
- Signed in as the devnet merchant, the API served its real data over HTTP: 1
  plan, 1 active subscriber, 1 succeeded charge, with MRR and 30-day revenue
  computed from the projections. All of it while the worker wrote to the same
  database concurrently, which is the multi-process case embedded PGlite cannot
  handle.
- `pnpm lint` (Biome, 84 files), `pnpm typecheck` (3 packages), `pnpm test`
  (34 tests), and `pnpm build` (5 dashboard routes, 9 API routes) are clean.

## Honest status

The live data path is done: worker, then Neon, then dashboard, verified with
real devnet projections.

The in-browser wallet handshake is written against the documented Wallet
Standard API but still needs a browser with a real wallet extension (Phantom or
Solflare) to confirm. It cannot be driven headlessly.
