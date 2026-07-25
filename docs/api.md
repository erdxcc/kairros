# REST API

Base path: `/api/v1`. All responses are JSON; token amounts and timestamps are
strings (u64-safe). Every data endpoint is scoped to the authenticated wallet.

Signing in proves control of a wallet and nothing more. The merchant endpoints
below additionally require that wallet to be a merchant, which today means it
owns at least one plan; they answer `403 merchant access required` otherwise.

## Authentication: Sign-In-With-Solana

No passwords. The wallet owner proves control by signing a server-issued
message; the server returns a 24h session JWT.

```
POST /api/v1/auth/nonce   { address }            -> { message, nonceToken }
# wallet signs `message` (base58 signature)
POST /api/v1/auth/verify  { address, message, signature, nonceToken } -> { token, address }
POST /api/v1/auth/logout  (Authorization: Bearer <token>)             -> { ok: true }
```

- `message` is a standard SIWS text embedding a random nonce and timestamp. The
  domain it names comes from `AUTH_DOMAIN`, never from the request's `Host`
  header: that header is chosen by the caller, and trusting it would let anyone
  have this server sign a message naming their domain. `AUTH_DOMAIN` is
  required in production.
- `nonceToken` is a short-lived (5 min) server token binding the address and a
  hash of `message`. It is **single-use**: `/auth/verify` burns it, so a
  captured `(message, signature)` pair cannot be replayed even inside those
  five minutes. A wrong signature does not burn it, so a failed attempt cannot
  invalidate someone else's in-flight sign-in.
- Send the session token as `Authorization: Bearer <token>` on every other
  endpoint.
- `/auth/logout` revokes the presented session server-side. Until you call it,
  a session token stays valid for its full 24 hours no matter what the browser
  has forgotten. It always answers `200`, so it cannot be used to probe which
  tokens are live.
- `/auth/nonce` and `/auth/verify` are unauthenticated and rate limited per
  client (30/min and 20/min). Over the limit they answer `429` with
  `Retry-After`. The limiter is per process; behind a proxy, set
  `TRUSTED_PROXY=1` so `x-forwarded-for` is used for the client identity.

The signature is verified with Ed25519: the wallet address is the public key,
verified against the exact UTF-8 bytes of `message`.

## Payer endpoints

Scoped to the signed-in wallet as a subscriber. No extra permission: signing in
is what makes a wallet a payer.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/me/subscriptions` | The wallet's own subscriptions, with the plan terms it agreed to |
| `GET` | `/me/subscriptions/<pda>` | One of them; `404` for a subscription the wallet does not pay for |
| `GET` | `/me/charges?limit=<n>` | Charges pulled from the wallet (succeeded and failed attempts) |
| `GET` | `/me/summary` | Active and ending counts, spend per mint over 30 days, next charge |

`summary.nextChargeTs` is unix seconds, computed with the same `subscriptionDue`
rule the billing worker charges by, so the date shown cannot drift from the date
money actually moves. It is `null` when nothing is due (for example every
subscription has a cancellation scheduled).

A cancelled subscription keeps running until `expiresAtTs`, which is the end of
the period already paid for. `endingSubscriptions` counts those; they are not
churn yet, and the UI should say "active until <date>", not "cancelled".

## Merchant endpoints

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

- `DATABASE_URL`: Postgres connection string (required; the API does not run
  on PGlite). Run `pnpm db:migrate` once against it.
- `AUTH_SECRET`: HMAC secret for nonce and session JWTs. Required in every
  deployment; a missing secret fails closed (the server refuses to sign or
  verify tokens). For local dev only, set `AUTH_ALLOW_INSECURE_SECRET=1` to fall
  back to a well-known insecure key.
- `AUTH_DOMAIN`: domain shown in the SIWS message (defaults to the request host).
- `SOLANA_CLUSTER`: `devnet` or `mainnet-beta`. Required, with no default:
  `GET /config` answers `500` rather than guessing.
- `NEXT_PUBLIC_SOLANA_CLUSTER`: the same value, inlined into the browser bundle
  for explorer links and the header badge. A production build fails without it.

## Notes

- The API is read-only over chain state; it never signs or sends transactions.
  Charging is the worker's job (the billing scheduler), and the chain remains
  the source of truth that the indexer/reconciler project into these tables.
- Webhook delivery, signing, and verification are documented in
  [webhooks.md](./webhooks.md).
