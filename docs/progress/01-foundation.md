# Foundation: a live lifecycle on devnet

The goal of this phase was to prove the idea works before building any product
around it. Not a mock, not a local validator: a real subscription charged on
devnet by a third-party billing key, which is exactly what kairos has to do for
merchants later.

## What shipped

**The monorepo.** pnpm workspace, TypeScript in strict mode, Biome, CI. Three
places for code to live: `packages/core` for everything shared with the on-chain
program, `apps/worker` for the indexer and scheduler, `apps/web` for the API and
dashboard. MIT licensed, same as the upstream program.

**A devnet environment in one command.** `pnpm setup:devnet` generates the
merchant, subscriber, and puller keypairs, funds them, and creates a 6-decimal
test mint (devUSDC). No manual key juggling before you can try anything.

**The lifecycle smoke test.** `pnpm demo:lifecycle` runs against the live
program: `createPlan` (5 devUSDC on a 1h period), `initSubscriptionAuthority`,
`subscribe`, then `transferSubscription` *executed by the puller key*, an
expected-failure second charge, `cancelSubscription`, and `resumeSubscription`.
Every step prints an explorer link so you can check the chain yourself.

## What we learned

Full notes live in [`../notes/program-semantics.md`](../notes/program-semantics.md).
The findings that shaped everything after this phase:

- The first charge is allowed immediately after subscribe. The per-period rule
  is an amount cap (error 400), not a cooldown, so billing logic had to be
  written around caps rather than timers.
- `cancelSubscription` grants an on-chain grace period until the end of the paid
  period (`expiresAt = periodStart + period`), and `resume` clears it.
- Insufficient funds surfaces as SPL Token error `0x1` and gets caught at
  preflight. A failed charge costs nothing and leaves no on-chain trace, so
  recording it is entirely kairos's job. That is the foundation for dunning.
- The service-puller model holds up. A key listed in the plan's mutable
  `pullers` can charge, while the immutable `destinations` guarantee it can
  never redirect funds somewhere else.
- The official SDK ships no event decoders, because events are absent from the
  IDL. So the indexer would have to decode the self-CPI wire format itself. The
  constants for that already live in `@kairos/core`.
