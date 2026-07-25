import { describe, expect, it } from 'vitest';
import { classifyChargeError, isRetryableFailure, subscriptionDue } from '../src/billing.js';

const base = {
    currentPeriodStartTs: 1_000_000n,
    amountPulledInPeriod: 0n,
    expiresAtTs: 0n,
    amount: 5_000_000n,
    periodHours: 1n,
};

describe('subscriptionDue', () => {
    it('fresh subscription is chargeable immediately (period 1 paid at start)', () => {
        expect(subscriptionDue(base, 1_000_001n)).toBe('first-charge');
    });

    it('already charged this period -> not due', () => {
        expect(subscriptionDue({ ...base, amountPulledInPeriod: 5_000_000n }, 1_000_100n)).toBeNull();
    });

    it('period elapsed -> renewal, even if previous period was charged', () => {
        expect(subscriptionDue({ ...base, amountPulledInPeriod: 5_000_000n }, 1_003_600n)).toBe('renewal');
    });

    it('renewal also applies when a period was never charged (lapsed coverage)', () => {
        expect(subscriptionDue(base, 1_003_600n)).toBe('renewal');
    });

    it('scheduled cancellation -> never charge during grace', () => {
        expect(subscriptionDue({ ...base, expiresAtTs: 1_003_600n }, 1_000_001n)).toBeNull();
        expect(subscriptionDue({ ...base, expiresAtTs: 1_003_600n }, 1_900_000n)).toBeNull();
    });

    it('clock before period start -> not due', () => {
        expect(subscriptionDue(base, 999_999n)).toBeNull();
    });
});

describe('classifyChargeError', () => {
    it('decimal preflight format', () => {
        expect(classifyChargeError('Custom program error: #400 (instruction #2)')).toBe('already_charged');
        expect(classifyChargeError('Custom program error: #401')).toBe('not_due');
        expect(
            classifyChargeError(
                'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: Custom program error: #1 (instruction #2)',
            ),
        ).toBe('insufficient_funds');
        expect(classifyChargeError('Custom program error: #508')).toBe('subscription_cancelled');
        expect(classifyChargeError('Custom program error: #500')).toBe('plan_inactive');
    });

    it('hex log format', () => {
        expect(classifyChargeError('failed: custom program error: 0x190')).toBe('already_charged');
    });

    // Error 1 means "insufficient funds" only when a token program raised it.
    // Every program numbers its errors from zero, so a bare 1 from anywhere
    // else is not a dunning case and must not be retried as one.
    describe('custom error 1 is only insufficient funds when a token program raised it', () => {
        it('attributes it when the SPL Token program is in the chain', () => {
            expect(
                classifyChargeError(
                    'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA failed: custom program error: 0x1',
                ),
            ).toBe('insufficient_funds');
        });

        it('attributes it for Token-2022 as well', () => {
            expect(
                classifyChargeError(
                    'Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: custom program error: 0x1',
                ),
            ).toBe('insufficient_funds');
        });

        it('still trusts an explicit log line', () => {
            expect(classifyChargeError('custom program error: 0x1: insufficient funds')).toBe(
                'insufficient_funds',
            );
        });

        it('does not attribute a bare error 1 from an unrelated program', () => {
            expect(classifyChargeError('failed: custom program error: 0x1')).toBe('unknown');
            expect(
                classifyChargeError(
                    'Program De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44 failed: custom program error: #1',
                ),
            ).toBe('unknown');
        });
    });

    it('falls back to log text and unknown', () => {
        expect(classifyChargeError('Program log: Error: insufficient funds')).toBe('insufficient_funds');
        expect(classifyChargeError('something exploded')).toBe('unknown');
        expect(classifyChargeError('Custom program error: #115')).toBe('unknown');
    });
});

describe('isRetryableFailure', () => {
    it('classic dunning cases are retryable', () => {
        expect(isRetryableFailure('insufficient_funds')).toBe(true);
        expect(isRetryableFailure('not_due')).toBe(true);
        expect(isRetryableFailure('unknown')).toBe(true);
    });
    it('terminal/no-op cases are not', () => {
        expect(isRetryableFailure('already_charged')).toBe(false);
        expect(isRetryableFailure('subscription_cancelled')).toBe(false);
        expect(isRetryableFailure('plan_inactive')).toBe(false);
        expect(isRetryableFailure('receiver_ata_missing')).toBe(false);
    });
});
