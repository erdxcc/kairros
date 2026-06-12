# Webhooks

kairos notifies your backend about subscription activity with HMAC-signed
HTTP POST requests. Events originate from on-chain program events (indexed
from the chain) and from kairos's own billing engine (failed charge attempts,
which never reach the chain).

## Event types

| Type | Source | Fired when |
| --- | --- | --- |
| `subscription.created` | on-chain | A user subscribed to one of your plans |
| `subscription.cancelled` | on-chain | A subscriber scheduled a cancellation (grace period runs until the end of the paid period) |
| `subscription.resumed` | on-chain | A subscriber resumed a pending cancellation |
| `charge.succeeded` | on-chain | A subscription payment landed (by kairos's scheduler or any authorized puller) |
| `charge.failed` | kairos billing engine | A scheduled charge attempt failed preflight (e.g. insufficient funds). Includes `failureKind` |

More types arrive with the dunning milestone (`subscription.past_due`,
`subscription.recovered`, `subscription.delinquent`).

## Payload

```json
{
    "id": 42,
    "type": "charge.succeeded",
    "created_at": "2026-06-13T09:40:24.000Z",
    "data": {
        "kind": "subscriptionTransfer",
        "subscription": "DGJrbTwgLkq5dpPkam2ZHzg4u3zvqRtj2hfh38EKPhTu",
        "plan": "9VyQU7it43EX4P7qbA46bFxBiscjEZ6p9cSta6jkC493",
        "delegator": "KDNyLbk1f6tqSqhriGt9ZhtcagdoxoVWkdor763oeaM",
        "mint": "GqNYWPuZYGC8NHX4SjGoqFmpSMNFmCNRvV4tJLDQKeVz",
        "amount": "5000000",
        "periodStartTs": "1781307564",
        "periodEndTs": "1781311164",
        "amountPulledInPeriod": "5000000",
        "receiver": "9F1UTmyJbYqYg2HURhfUJuhxPkxrLz3tFWLrtqdirxZM",
        "signature": "3pAy1oK1hKAL...",
        "blockTime": "1781307624"
    }
}
```

Notes:

- `id` is unique per event and stable across retries — use it for idempotency.
- All token amounts are strings in base units (u64-safe). All `*Ts` fields are
  unix seconds as strings.
- On-chain events carry the transaction `signature`; verify anything you like
  directly against the chain.

## Verifying signatures

Every request carries:

```
kairos-signature: t=1781307624,v1=<hex>
kairos-event: charge.succeeded
kairos-delivery: 17
```

`v1` is `HMAC-SHA256(secret, "<t>.<raw body>")` in hex, where `secret` is the
endpoint secret issued at registration (`whsec_...`). Verify with a
constant-time comparison and reject stale timestamps (e.g. older than 5
minutes) to prevent replays:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(header: string, body: string, secret: string): boolean {
    const { t, v1 } = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
    if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
    const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
}
```

## Delivery semantics

- **At-least-once.** Deduplicate on `id`.
- Your endpoint must respond with a 2xx within 10 seconds; anything else is a
  failed attempt.
- Failed attempts retry with backoff: 30s, 2m, 10m, 1h, 6h (5 attempts total),
  then the delivery is marked dead. Delivery log UI and manual replay arrive
  in the production-webhooks milestone.
- When you register an endpoint after events already exist, the existing
  backlog for your merchant is delivered too (history flush).

## Local testing

```bash
pnpm --filter @kairos/core webhook:register http://127.0.0.1:8787/webhook
WEBHOOK_SECRET=<printed secret> pnpm --filter @kairos/core webhook:receiver
pnpm worker:dev
```
