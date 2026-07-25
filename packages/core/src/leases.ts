/**
 * Cooperative single-runner leases for the worker loops.
 *
 * The indexer, scheduler, dispatcher and reconciler are each written as "read
 * some rows, act on them" without claiming what they are about to act on. Run
 * two worker processes and they interleave: two schedulers send
 * `transferSubscription` for the same period, two dispatchers POST the same
 * webhook, two indexers fetch the same transactions. The on-chain program caps
 * the money damage (a second pull in a period is rejected), but the merchant
 * still sees duplicate deliveries and the RPC bill still doubles.
 *
 * Rather than make four loops individually concurrency-safe, a loop runs only
 * while it holds a named lease. A lease is a row with an expiry, so a worker
 * that is killed mid-cycle does not wedge the system: the lease lapses and the
 * next process takes over. `renew` is called each cycle, so a live holder
 * keeps its lease and a dead one loses it after at most `ttlMs`.
 *
 * This is deliberately cooperative, not a distributed lock: a paused-then-
 * resumed process can briefly believe it still holds a lapsed lease. That is
 * survivable precisely because the underlying operations are idempotent
 * (inserts are conflict-guarded, charges are capped on-chain) — the lease
 * removes routine duplication, it does not stand in for those guarantees.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import type { KairosDb } from './db/client.js';
import * as dbSchema from './db/schema.js';

/** Identifies this process across all of its leases. */
export const PROCESS_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

export interface LeaseOptions {
    db: KairosDb;
    name: string;
    /** How long the lease survives without renewal. */
    ttlMs: number;
    holder?: string;
}

/**
 * Takes or renews the named lease. Returns true when this process holds it.
 *
 * One statement, so two workers racing for a free lease cannot both win: the
 * upsert only overwrites a row that has expired or that we already own.
 */
export async function acquireLease(opts: LeaseOptions): Promise<boolean> {
    const holder = opts.holder ?? PROCESS_ID;
    // A timestamp the database computes, so leases do not depend on worker
    // clocks agreeing with each other.
    const expiry = sql`now() + ${`${opts.ttlMs} milliseconds`}::interval` as unknown as Date;
    const claimed = await opts.db
        .insert(dbSchema.workerLeases)
        .values({ name: opts.name, holder, expiresAt: expiry })
        .onConflictDoUpdate({
            target: dbSchema.workerLeases.name,
            set: { holder, expiresAt: expiry },
            setWhere: or(
                eq(dbSchema.workerLeases.holder, holder),
                lt(dbSchema.workerLeases.expiresAt, sql`now()`),
            ),
        })
        .returning({ holder: dbSchema.workerLeases.holder });
    return claimed[0]?.holder === holder;
}

/** Gives up the lease, but only if we still hold it. */
export async function releaseLease(opts: Omit<LeaseOptions, 'ttlMs'>): Promise<void> {
    const holder = opts.holder ?? PROCESS_ID;
    await opts.db
        .delete(dbSchema.workerLeases)
        .where(and(eq(dbSchema.workerLeases.name, opts.name), eq(dbSchema.workerLeases.holder, holder)));
}

export interface LeasedLoopOptions extends LeaseOptions {
    /** Time between iterations while we hold the lease. */
    intervalMs: number;
    /** Time between attempts to take a lease held by someone else. */
    standbyIntervalMs?: number;
    stopSignal: { stopped: boolean };
    /** One iteration. Runs only while the lease is held. */
    tick: () => Promise<void>;
    /** Label for log lines. */
    label: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sleeps in short steps so shutdown stays responsive. */
async function interruptibleSleep(ms: number, stopSignal: { stopped: boolean }): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !stopSignal.stopped) {
        await sleep(Math.min(1000, deadline - Date.now()));
    }
}

/**
 * Waits out the interval between cycles, renewing the lease as it goes so a
 * long interval does not outlive the lease that protects it. Renewing at a
 * third of the TTL leaves room for two failed renewals before the lease is
 * genuinely at risk.
 */
async function holdThrough(opts: LeasedLoopOptions): Promise<void> {
    const renewEvery = Math.max(Math.floor(opts.ttlMs / 3), 1000);
    const deadline = Date.now() + opts.intervalMs;
    while (Date.now() < deadline && !opts.stopSignal.stopped) {
        await interruptibleSleep(Math.min(renewEvery, deadline - Date.now()), opts.stopSignal);
        if (opts.stopSignal.stopped || Date.now() >= deadline) return;
        try {
            if (!(await acquireLease(opts))) {
                // Someone else holds it now. Return so the outer loop notices
                // and drops into standby rather than ticking without a lease.
                return;
            }
        } catch (error) {
            console.error(`[${opts.label}] lease renewal error:`, error);
        }
    }
}

/**
 * Runs `tick` on an interval for as long as this process holds the lease,
 * and idles as a warm standby when another process holds it.
 *
 * The lease TTL must comfortably exceed one iteration, or a slow cycle lets
 * the lease lapse under its own holder.
 */
export async function runLeasedLoop(opts: LeasedLoopOptions): Promise<void> {
    const standby = opts.standbyIntervalMs ?? Math.max(opts.ttlMs / 2, 5_000);
    let wasHolding = false;

    while (!opts.stopSignal.stopped) {
        let holding = false;
        try {
            holding = await acquireLease(opts);
        } catch (error) {
            console.error(`[${opts.label}] lease error:`, error);
        }

        if (holding) {
            if (!wasHolding) console.log(`[${opts.label}] holding the lease; running`);
            wasHolding = true;
            try {
                await opts.tick();
            } catch (error) {
                console.error(`[${opts.label}] cycle error:`, error);
            }
            // Renew while waiting, not just between cycles. The reconciler
            // sleeps for an hour between sweeps; a lease that only refreshes
            // at the top of a cycle would lapse mid-sleep and be handed to a
            // standby, so the loop would bounce between workers for no reason.
            await holdThrough(opts);
        } else {
            if (wasHolding) {
                console.warn(`[${opts.label}] lost the lease to another worker; standing by`);
            } else {
                console.log(`[${opts.label}] another worker holds the lease; standing by`);
            }
            wasHolding = false;
            await interruptibleSleep(standby, opts.stopSignal);
        }
    }

    if (wasHolding) {
        // Hand over immediately instead of making the next worker wait out the TTL.
        await releaseLease(opts).catch((error) =>
            console.error(`[${opts.label}] failed to release lease:`, error),
        );
    }
    console.log(`[${opts.label}] stopped`);
}
