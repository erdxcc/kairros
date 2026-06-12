# solbill

**Open-source merchant billing layer for the native Solana Subscriptions program.**

The [Solana Subscriptions & Allowances program](https://github.com/solana-program/subscriptions)
(mainnet, June 2026, audited by Cantina/Spearbit) is the on-chain *engine* for recurring payments:
subscription plans, recurring delegations, and fixed allowances. It is deliberately not a product —
there is no dashboard, no failed-payment handling, no webhooks, no checkout.

solbill is that missing product layer — what Stripe Billing provides on top of a card network:

- 📊 **Merchant dashboard** — subscribers, MRR, churn, payment history
- ⚙️ **Automatic billing** — a scheduler that pulls due payments via the program's `pullers` mechanism
- 🪝 **Webhooks** — HMAC-signed events so your backend can react to subscription activity
- 🔁 **Dunning** — retries, grace periods, and statuses for failed charges *(roadmap)*
- 🧩 **"Subscribe with Solana" checkout & widget** — hosted checkout and an embeddable button *(roadmap)*
- 🔔 **Subscriber notifications** — Telegram alerts for upcoming and failed charges *(roadmap)*

solbill is fully open source (MIT), self-hostable, and built to accelerate adoption of the
Foundation's native primitive — not to compete with it. It never wraps or forks the on-chain
program; it is a pure client-side layer.

## Status

🚧 **Early development — devnet MVP in progress.** Follow the build in [`/updates`](./updates).

| Component | Status |
| --- | --- |
| Devnet lifecycle smoke test | 🔨 in progress |
| Event indexer | ⏳ planned |
| REST API + billing scheduler + webhooks | ⏳ planned |
| Merchant dashboard | ⏳ planned |
| Dunning, checkout widget, Telegram notifications | 🗺️ roadmap |

## Repository layout

```
packages/core    Shared layer: program constants, event decoders, config
apps/worker      Indexer + billing scheduler + webhook dispatcher (long-running process)
apps/web         Merchant dashboard + REST API (Next.js; scaffolded in a later phase)
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

## On-chain program

| | |
| --- | --- |
| Program | [`solana-program/subscriptions`](https://github.com/solana-program/subscriptions) |
| Program ID | `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` (mainnet & devnet) |
| SDK | [`@solana/subscriptions`](https://www.npmjs.com/package/@solana/subscriptions) on `@solana/kit` |

## License

[MIT](./LICENSE)
