# kairos

**Open-source merchant billing layer for the native Solana Subscriptions program.**

The [Solana Subscriptions & Allowances program](https://github.com/solana-program/subscriptions)
(mainnet, June 2026, audited by Cantina/Spearbit) is the on-chain engine for
recurring payments: subscription plans, recurring delegations, fixed allowances.
It is deliberately not a product. There is no dashboard, no failed-payment
handling, no webhooks, no checkout.

kairos is that missing product layer, the same way Stripe Billing sits on top of
a card network:

- **Merchant dashboard** with subscribers, MRR, churn, and payment history
- **Automatic billing**, a scheduler that pulls due payments through the
  program's `pullers` mechanism
- **Webhooks**, HMAC-signed events so your backend can react to subscription
  activity
- **Dunning**: retries, grace periods, and statuses for failed charges *(planned)*
- **"Subscribe with Solana" checkout**, hosted and as an embeddable button *(planned)*
- **Subscriber notifications**, Telegram alerts for upcoming and failed charges *(planned)*

Everything here is MIT licensed, self-hostable, and built to speed up adoption of
the Foundation's native primitive rather than compete with it. kairos never wraps
or forks the on-chain program. It is a pure client-side layer.

## Status

Early development, devnet MVP. The engine works end to end on devnet: the
indexer, the billing scheduler, webhooks, the REST API, and the dashboard all
run against real on-chain activity.

## Repository layout

```
packages/core    Program constants, event decoders, billing rules, db, config
apps/worker      Indexer, billing scheduler, webhook dispatcher, reconciler
apps/web         Merchant REST API and dashboard (Next.js App Router)
apps/landing     Marketing site (Next.js App Router)
docs/            Integration notes, research, and the build log
```

`apps/web` and `apps/landing` are separate Next.js apps with separate
deployments: the dashboard is an authenticated product surface, the landing page
is a static marketing site. They share the repo, not a runtime.

## Development phases

Each phase has a write-up in [`docs/progress`](./docs/progress) covering what
shipped and what was verified.

| Phase | State |
| --- | --- |
| [Foundation](./docs/progress/01-foundation.md): monorepo and a live devnet lifecycle | done |
| [Event indexer](./docs/progress/02-event-indexer.md): all six events, golden-fixture decoders, crash-safe ingestion | done |
| [Billing engine](./docs/progress/03-billing-engine.md): auto-charge via the puller key, HMAC webhooks, reconciler | done, verified live on devnet |
| [Merchant API](./docs/progress/04-merchant-api.md): Sign-In-With-Solana auth, plans, subscribers, charges, metrics | done ([spec](./docs/api.md)) |
| [Merchant dashboard](./docs/progress/05-dashboard.md): Overview, Plans, Subscribers, Payments, Settings | done, browser wallet handshake still needs a manual check |
| [Landing site](./docs/progress/06-landing-site.md): the public marketing page | done |
| Dunning, checkout widget, Telegram notifications | planned |
| Mainnet: KMS-backed puller key, production deployment | planned |

## Quickstart (devnet)

You need Node.js 20.18 or newer, pnpm 9, and the
[Solana CLI](https://solana.com/docs/intro/installation) pointed at devnet with a
funded keypair.

```bash
pnpm install
cp .env.example .env        # adjust the RPC URL if you have a Helius or other endpoint
pnpm setup:devnet           # generates merchant/subscriber/puller keys, creates a test mint
pnpm demo:lifecycle         # createPlan, subscribe, charge, cancel, resume, end to end
```

## Running the indexer

The worker tails the live program and projects events into Postgres, or into
embedded [PGlite](https://pglite.dev/) if you would rather not set up a database:

```bash
pnpm worker:dev             # backfills, then polls every 8s
pnpm db:stats               # events by kind, plans, subscriptions, charges
```

It polls `getSignaturesForAddress` from a persisted cursor and inserts
idempotently, so you can kill the worker at any point and restart it. It picks up
from the exact signature it stopped at, with no gaps and no duplicates. The event
decoders are locked by golden fixtures recorded from real devnet transactions
(`packages/core/test/fixtures`), so an upstream wire-format change fails CI
instead of quietly corrupting data.

## Running the API and dashboard

The REST API lives under `/api/v1` and authenticates merchants with
[Sign-In-With-Solana](./docs/api.md). It serves their plans, subscribers,
charges, MRR and churn metrics, and webhook endpoints, all scoped to the
authenticated wallet. It reads the projections the worker maintains, so it never
touches RPC.

The API and the worker share one database. PGlite is single-process, so a shared
setup needs Postgres: a free [Neon](https://neon.tech) database or
`docker compose up -d`.

```bash
export DATABASE_URL=postgres://...
pnpm db:migrate             # create the schema
pnpm web:dev                # dashboard and API on http://localhost:3000
```

The dashboard is the same Next.js app. Sign in by signing a message with a Solana
wallet (Phantom, Solflare, and anything else that speaks the
[Wallet Standard](https://github.com/wallet-standard/wallet-standard)). No
passwords, no transaction. From there you get Overview (MRR, active subscribers,
churn, a 30-day revenue chart), Plans, Subscribers, Payments with Explorer links,
and Settings, which holds the puller key to add to your plans plus your webhook
endpoints.

For a production-style run:

```bash
pnpm --filter @kairos/web build && pnpm --filter @kairos/web start
pnpm --filter @kairos/web api:smoke    # full sign-in flow plus every endpoint
```

## Running the landing site

```bash
pnpm landing:dev            # http://localhost:3001
```

Its "Start" and "Sign in" buttons point at `NEXT_PUBLIC_DASHBOARD_URL`, which
defaults to `http://localhost:3000`. Set it to the dashboard's public origin
before deploying. The production domain for canonical URLs, Open Graph, robots,
and the sitemap lives in `apps/landing/lib/site.ts`.

## Checks

```bash
pnpm lint                   # Biome
pnpm typecheck              # every workspace
pnpm test                   # unit and integration tests
pnpm build                  # both Next.js apps and the worker
```

## On-chain program

| | |
| --- | --- |
| Program | [`solana-program/subscriptions`](https://github.com/solana-program/subscriptions) |
| Program ID | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` (mainnet and devnet) |
| SDK | [`@solana/subscriptions`](https://www.npmjs.com/package/@solana/subscriptions) on `@solana/kit` |

## License

[MIT](./LICENSE)
