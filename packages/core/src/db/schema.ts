/**
 * kairos database schema (Drizzle, PostgreSQL dialect — works on both real
 * Postgres and embedded PGlite).
 *
 * Design rule: everything on-chain-derived (`chain_events`, `plans`,
 * `subscriptions`, on-chain `charges`) is a rebuildable projection — the chain
 * is the source of truth. Off-chain-only truth (failed charge attempts later,
 * outbox, cursors) lives here exclusively.
 *
 * Token amounts use numeric(20,0): SPL amounts are u64 and can exceed the
 * signed bigint range. Timestamps from chain are unix seconds (bigint).
 */
import { sql } from 'drizzle-orm';
import {
    bigint,
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

/** Mirror of on-chain Plan accounts (filled on demand from RPC). */
export const plans = pgTable('plans', {
    planPda: text('plan_pda').primaryKey(),
    owner: text('owner').notNull(),
    planId: numeric('plan_id', { precision: 20, scale: 0 }).notNull(),
    mint: text('mint').notNull(),
    amount: numeric('amount', { precision: 20, scale: 0 }).notNull(),
    periodHours: bigint('period_hours', { mode: 'bigint' }).notNull(),
    /** 'active' | 'sunset' (mirrors on-chain PlanStatus) */
    status: text('status').notNull(),
    endTs: bigint('end_ts', { mode: 'bigint' }).notNull(),
    destinations: jsonb('destinations').$type<string[]>().notNull(),
    pullers: jsonb('pullers').$type<string[]>().notNull(),
    metadataUri: text('metadata_uri').notNull().default(''),
    createdAtChain: bigint('created_at_chain', { mode: 'bigint' }).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Projection of on-chain SubscriptionDelegation accounts. */
export const subscriptions = pgTable('subscriptions', {
    subscriptionPda: text('subscription_pda').primaryKey(),
    planPda: text('plan_pda').notNull(),
    subscriber: text('subscriber').notNull(),
    mint: text('mint').notNull(),
    /** 'active' | 'cancelled' — cancelled means expiry is scheduled on-chain. */
    status: text('status').notNull(),
    createdTs: bigint('created_ts', { mode: 'bigint' }).notNull(),
    currentPeriodStartTs: bigint('current_period_start_ts', { mode: 'bigint' }).notNull(),
    amountPulledInPeriod: numeric('amount_pulled_in_period', { precision: 20, scale: 0 })
        .notNull()
        .default('0'),
    expiresAtTs: bigint('expires_at_ts', { mode: 'bigint' }).notNull().default(sql`0`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Charge history. Rows with a signature mirror successful on-chain transfers
 * (1:1 with a chain_events row). Failed attempts (recorded by the billing
 * worker from Phase 2 on) have no signature — they never reach the chain.
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
    (t) => [uniqueIndex('charges_chain_event_unique').on(t.chainEventId)],
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
export const outbox = pgTable('outbox', {
    id: serial('id').primaryKey(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
});
