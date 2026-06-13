# Merchant REST API

Base path: `/api/v1`. All responses are JSON; token amounts and timestamps are
strings (u64-safe). Every data endpoint is scoped to the authenticated
merchant — the wallet that owns the plans.

## Authentication — Sign-In-With-Solana

No passwords. The merchant proves control of their wallet by signing a
server-issued message; the server returns a 24h session JWT.

```
POST /api/v1/auth/nonce   { address }            -> { message, nonceToken }
# wallet signs `message` (base58 signature)
POST /api/v1/auth/verify  { address, message, signature, nonceToken } -> { token, merchant }
```

- `message` is a standard SIWS text embedding a random nonce and timestamp.
- `nonceToken` is a short-lived (5 min) server token binding the address and a
  hash of `message`, so a captured signature cannot be replayed later.
- Send the session token as `Authorization: Bearer <token>` on every other
  endpoint.

The signature is verified with Ed25519: the wallet address is the public key,
verified against the exact UTF-8 bytes of `message`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/plans` | The merchant's plans (on-chain projection) |
| `GET` | `/subscriptions?plan=<pda>` | Subscriptions to the merchant's plans; optional plan filter |
| `GET` | `/charges?limit=<n>` | Charge history (succeeded on-chain transfers + failed attempts) |
| `GET` | `/metrics` | MRR, active subscribers, churn, revenue (30d) + daily series |
| `GET` | `/webhook-endpoints` | The merchant's webhook endpoints (secrets never returned) |
| `POST` | `/webhook-endpoints` `{ url }` | Register an endpoint; the signing `secret` is returned **once** |
| `DELETE` | `/webhook-endpoints?id=<id>` | Deactivate an endpoint |

### Metrics shape

```json
{
    "metrics": {
        "mrr": "10000000",
        "mints": ["EPjFW...Dt1v"],
        "activeSubscribers": 2,
        "canceledLast30d": 1,
        "churnRate": 0.333,
        "revenueLast30d": "5000000",
        "revenueSeries": [{ "day": "2026-06-13", "amount": "5000000" }]
    }
}
```

`mrr` normalizes every active subscription's plan amount to a monthly figure
(`amount × 730 / periodHours`) and sums it, in base units. When subscriptions
span multiple mints, `mints` lists them so the client can format/segment.

## Configuration

- `DATABASE_URL` — Postgres connection string (required; the API does not run
  on PGlite). Run `pnpm db:migrate` once against it.
- `AUTH_SECRET` — HMAC secret for nonce and session JWTs. Required in
  production; a dev fallback is used otherwise.
- `AUTH_DOMAIN` — domain shown in the SIWS message (defaults to the request host).

## Notes

- The API is read-only over chain state; it never signs or sends transactions.
  Charging is the worker's job (the billing scheduler), and the chain remains
  the source of truth that the indexer/reconciler project into these tables.
- Webhook delivery, signing, and verification are documented in
  [webhooks.md](./webhooks.md).
