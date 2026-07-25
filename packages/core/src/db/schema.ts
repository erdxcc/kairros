/**
 * kairos database schema (Drizzle, PostgreSQL dialect, works on both real
 * Postgres and embedded PGlite).
 *
 * Design rule: everything on-chain-derived (`chain_events`, `plans`,
 * `subscriptions`, on-chain `charges`) is a rebuildable projection: the chain
 * is the source of truth. Off-chain-only truth (failed charge attempts later,
 * outbox, cursors) lives here exclusively.
 *
 * Token amounts use numeric(20,0): SPL amounts are u64 and can exceed the
 * signed bigint range. Timestamps from chain are unix seconds (bigint).
 */
import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    index,
    integer,
    jsonb,
    numeric,
    pgTable,
    serial,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Append-only log of decoded program events, idempotent on (signature, position). */
export const chainEvents = pgTable(
    'chain_events',
    {
        id: serial('id').primaryKey(),
        signature: text('signature').notNull(),
        outerIxIndex: integer('outer_ix_index').notNull(),
        innerIxIndex: integer('inner_ix_index').notNull(),
        slot: bigint('slot', { mode: 'bigint' }).notNull(),
        blockTime: bigint('block_time', { mode: 'bigint' }),
        kind: text('kind').notNull(),
        /** Decoded event payload with bigints rendered as strings. */
        payload: jsonb('payload').$type<Record<string, string>>().notNull(),
        ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [uniqueIndex('chain_events_position_unique').on(t.signature, t.outerIxIndex, t.innerIxIndex)],
);

/**
 * Mirror of on-chain Plan accounts (filled on demand from RPC).
 *
 * `owner` is the merchant scope for every dashboard read, so it carries an
 * index: `isMerchant` runs it on every authenticated merchant request.
 */
export const plans = pgTable(
    'plans',
    {
        planPda: text('plan_pda').primaryKey(),
        owner: text('owner').notNull(),
        planId: numeric('plan_id', { precision: 20, scale: 0 }).notNull(),
        mint: text('mint').notNull(),
        amount: numeric('amount', { precision: 20, scale: 0 }).notNull(),
        periodHours: bigint('period_hours', { mode: 'bigint' }).notNull(),
        /**
         * 'active' | 'sunset' (mirrors on-chain PlanStatus), plus two states
         * that exist only here:
         *   'closed'     the account is gone on-chain (confirmed by a sweep)
         *   'unresolved' a placeholder row: the account read did not come back
         *                when the first event referencing it landed. The
         *                reconciler retries these and fills in the real terms.
         *                Never charged: the scheduler only looks at 'active'.
         */
        status: text('status').notNull(),
        endTs: bigint('end_ts', { mode: 'bigint' }).notNull(),
        destinations: jsonb('destinations').$type<string[]>().notNull(),
        pullers: jsonb('pullers').$type<string[]>().notNull(),
        metadataUri: text('metadata_uri').notNull().default(''),
        createdAtChain: bigint('created_at_chain', { mode: 'bigint' }).notNull(),
        firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        /**
         * When the reconciler last compared this row against the chain,
         * regardless of whether anything changed. Ordering a sweep by this
         * column is what keeps it bounded: each pass takes the stalest rows.
         */
        reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    },
    (t) => [
        index('plans_owner_idx').on(t.owner),
        index('plans_status_reconciled_idx').on(t.status, t.reconciledAt),
    ],
);

/** Projection of on-chain SubscriptionDelegation accounts. */
export const subscriptions = pgTable(
    'subscriptions',
    {
        subscriptionPda: text('subscription_pda').primaryKey(),
        planPda: text('plan_pda').notNull(),
        subscriber: text('subscriber').notNull(),
        mint: text('mint').notNull(),
        /** 'active' | 'cancelled' | 'revoked': cancelled means expiry is scheduled on-chain. */
        status: text('status').notNull(),
        createdTs: bigint('created_ts', { mode: 'bigint' }).notNull(),
        currentPeriodStartTs: bigint('current_period_start_ts', { mode: 'bigint' }).notNull(),
        amountPulledInPeriod: numeric('amount_pulled_in_period', { precision: 20, scale: 0 })
            .notNull()
            .default('0'),
        expiresAtTs: bigint('expires_at_ts', { mode: 'bigint' }).notNull().default(sql`0`),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        /** See `plans.reconciledAt`. */
        reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    },
    (t) => [
        index('subscriptions_subscriber_idx').on(t.subscriber),
        index('subscriptions_plan_idx').on(t.planPda),
        index('subscriptions_status_reconciled_idx').on(t.status, t.reconciledAt),
    ],
);

/**
 * Charge history. Rows with a signature mirror successful on-chain transfers
 * (1:1 with a chain_events row). Failed attempts (recorded by the billing
 * worker from Phase 2 on) have no signature: they never reach the chain.
 */
export const charges = pgTable(
    'charges',
    {
        id: serial('id').primaryKey(),
        chainEventId: integer('chain_event_id'),
        subscriptionPda: text('subscription_pda').notNull(),
        planPda: text('plan_pda').notNull(),
        subscriber: text('subscriber').notNull(),
        mint: text('mint').notNull(),
        amount: numeric('amount', { precision: 20, scale: 0 }).notNull(),
        receiver: text('receiver'),
        periodStartTs: bigint('period_start_ts', { mode: 'bigint' }),
        periodEndTs: bigint('period_end_ts', { mode: 'bigint' }),
        /** 'succeeded' | 'failed' */
        status: text('status').notNull(),
        errorCode: text('error_code'),
        signature: text('signature'),
        executedAt: bigint('executed_at', { mode: 'bigint' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex('charges_chain_event_unique').on(t.chainEventId),
        index('charges_plan_idx').on(t.planPda),
        index('charges_subscriber_idx').on(t.subscriber),
        // The scheduler's per-period dedupe lookup.
        index('charges_subscription_period_idx').on(t.subscriptionPda, t.periodStartTs),
    ],
);

/** Indexer progress markers (e.g. last fully processed signature). */
export const cursors = pgTable('cursors', {
    id: text('id').primaryKey(),
    lastSignature: text('last_signature'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional outbox: domain events produced by projections, consumed by
 * the webhook dispatcher / notifier (Phase 2+).
 */
export const outbox = pgTable(
    'outbox',
    {
        id: serial('id').primaryKey(),
        eventType: text('event_type').notNull(),
        payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        processedAt: timestamp('processed_at', { withTimezone: true }),
    },
    // The dispatcher polls `processed_at is null order by id` every few
    // seconds; this composite serves both halves so the scan stays
    // proportional to the backlog rather than to all history.
    (t) => [index('outbox_unprocessed_idx').on(t.processedAt, t.id)],
);

/** Merchant webhook endpoints (registered via the API; one secret each). */
export const webhookEndpoints = pgTable(
    'webhook_endpoints',
    {
        id: serial('id').primaryKey(),
        /** Merchant wallet pubkey: webhook events are routed by plan owner. */
        merchant: text('merchant').notNull(),
        url: text('url').notNull(),
        secret: text('secret').notNull(),
        active: boolean('active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('webhook_endpoints_merchant_idx').on(t.merchant)],
);

/** Delivery log: one row per (outbox event, endpoint), with retry state. */
export const webhookDeliveries = pgTable(
    'webhook_deliveries',
    {
        id: serial('id').primaryKey(),
        endpointId: integer('endpoint_id').notNull(),
        outboxId: integer('outbox_id').notNull(),
        eventType: text('event_type').notNull(),
        /** 'pending' | 'succeeded' | 'failed' (will retry) | 'dead' (gave up) */
        status: text('status').notNull().default('pending'),
        attempts: integer('attempts').notNull().default(0),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
        lastError: text('last_error'),
        responseStatus: integer('response_status'),
        deliveredAt: timestamp('delivered_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex('webhook_deliveries_endpoint_outbox_unique').on(t.endpointId, t.outboxId),
        index('webhook_deliveries_due_idx').on(t.status, t.nextAttemptAt),
    ],
);

/**
 * Single-use / revoked token registry, keyed by JWT id.
 *
 * Two uses, one shape, because both are "this token id is spent" with an
 * expiry after which the row is noise:
 *   - `nonce`   burned by /auth/verify, so a captured signature cannot be
 *               replayed inside the nonce's 5 minute window.
 *   - `session` written by /auth/logout, so signing out actually ends the
 *               session server-side instead of only clearing localStorage.
 *
 * Rows are pruned opportunistically once past `expiresAt`: the JWT is
 * worthless by then, so forgetting it changes nothing.
 */
export const consumedTokens = pgTable(
    'consumed_tokens',
    {
        jti: text('jti').primaryKey(),
        /** 'nonce' | 'session' */
        purpose: text('purpose').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('consumed_tokens_expires_idx').on(t.expiresAt)],
);

/**
 * Cooperative leases, one row per worker loop.
 *
 * The indexer, scheduler, dispatcher and reconciler are all written for a
 * single runner: none of them claims the rows it is about to act on, so two
 * processes would double-charge, double-deliver and double-index. Rather than
 * make each loop individually safe to run in parallel, a loop only runs while
 * it holds its named lease, and a lease outlives the holder by a bounded
 * amount so a killed worker is replaced rather than deadlocking the system.
 */
export const workerLeases = pgTable('worker_leases', {
    /** Loop name: 'indexer' | 'scheduler' | 'dispatcher' | 'reconciler'. */
    name: text('name').primaryKey(),
    /** Random per-process id, so a holder can tell its own lease from a rival's. */
    holder: text('holder').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
});
