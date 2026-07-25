/**
 * The lease is what stops a second worker process from double-charging and
 * double-delivering, so the contended cases are the point of these tests, not
 * the happy path.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { type KairosDb, createDb } from '../src/db/client.js';
import * as dbSchema from '../src/db/schema.js';
import { acquireLease, releaseLease } from '../src/leases.js';

let db: KairosDb;

beforeEach(async () => {
    db = await createDb('pglite://memory', { migrate: true });
}, 30_000);

const lease = (holder: string, ttlMs = 60_000) => acquireLease({ db, name: 'scheduler', ttlMs, holder });

describe('acquireLease', () => {
    it('grants a free lease', async () => {
        expect(await lease('worker-a')).toBe(true);
    });

    it('refuses a lease another live holder owns', async () => {
        expect(await lease('worker-a')).toBe(true);
        expect(await lease('worker-b')).toBe(false);
        // ...and the incumbent keeps it.
        const [row] = await db.select().from(dbSchema.workerLeases);
        expect(row?.holder).toBe('worker-a');
    });

    it('renews for the holder rather than blocking it', async () => {
        expect(await lease('worker-a')).toBe(true);
        expect(await lease('worker-a')).toBe(true);
        expect(await lease('worker-a')).toBe(true);
    });

    it('hands an expired lease to whoever asks next', async () => {
        // A worker that took the lease and died: TTL already elapsed.
        expect(await lease('worker-a', -1000)).toBe(true);
        expect(await lease('worker-b')).toBe(true);
        const [row] = await db.select().from(dbSchema.workerLeases);
        expect(row?.holder).toBe('worker-b');
    });

    it('keeps leases for different loops independent', async () => {
        expect(await acquireLease({ db, name: 'scheduler', ttlMs: 60_000, holder: 'a' })).toBe(true);
        expect(await acquireLease({ db, name: 'dispatcher', ttlMs: 60_000, holder: 'b' })).toBe(true);
        expect(await db.select().from(dbSchema.workerLeases)).toHaveLength(2);
    });
});

describe('releaseLease', () => {
    it('lets the next worker take over immediately', async () => {
        expect(await lease('worker-a')).toBe(true);
        await releaseLease({ db, name: 'scheduler', holder: 'worker-a' });
        expect(await lease('worker-b')).toBe(true);
    });

    it('will not let one worker release another worker lease', async () => {
        expect(await lease('worker-a')).toBe(true);
        await releaseLease({ db, name: 'scheduler', holder: 'worker-b' });
        expect(await lease('worker-b')).toBe(false); // still worker-a's
    });
});
