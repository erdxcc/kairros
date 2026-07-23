import { beforeEach, describe, expect, it, vi } from 'vitest';

// Control DNS resolution so hostname tests are hermetic (no real network).
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

import { UnsafeWebhookUrlError, assertSafeWebhookUrl, isPrivateIp } from '../src/ssrf.js';

beforeEach(() => {
    lookupMock.mockClear();
});

describe('isPrivateIp', () => {
    it('flags private / reserved IPv4', () => {
        for (const ip of [
            '0.0.0.0',
            '10.0.0.1',
            '100.64.0.1',
            '127.0.0.1',
            '169.254.169.254', // cloud metadata
            '172.16.5.5',
            '172.31.255.255',
            '192.168.1.1',
            '198.18.0.1',
            '255.255.255.255',
        ]) {
            expect(isPrivateIp(ip), ip).toBe(true);
        }
    });

    it('allows public IPv4', () => {
        for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1']) {
            expect(isPrivateIp(ip), ip).toBe(false);
        }
    });

    it('flags private / reserved IPv6 (incl. IPv4-mapped)', () => {
        for (const ip of [
            '::',
            '::1',
            'fe80::1',
            'fc00::1',
            'fd12::1',
            'ff02::1',
            '::ffff:127.0.0.1',
            '::ffff:10.0.0.1',
        ]) {
            expect(isPrivateIp(ip), ip).toBe(true);
        }
    });

    it('allows public IPv6', () => {
        expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
        expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('treats non-IP input as unsafe (fail closed)', () => {
        expect(isPrivateIp('not-an-ip')).toBe(true);
        expect(isPrivateIp('999.999.999.999')).toBe(true);
    });
});

describe('assertSafeWebhookUrl', () => {
    it('rejects non-https and credential-bearing URLs (before any DNS)', async () => {
        await expect(assertSafeWebhookUrl('http://example.com/hook')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
        await expect(assertSafeWebhookUrl('https://user:pass@example.com/hook')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
        await expect(assertSafeWebhookUrl('not a url')).rejects.toBeInstanceOf(UnsafeWebhookUrlError);
        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects IP-literal hosts in private / reserved ranges', async () => {
        await expect(assertSafeWebhookUrl('https://127.0.0.1/hook')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
        await expect(assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
        await expect(assertSafeWebhookUrl('https://[::1]/hook')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
    });

    it('accepts a public IP literal without resolving', async () => {
        const url = await assertSafeWebhookUrl('https://8.8.8.8/hook');
        expect(url.href).toBe('https://8.8.8.8/hook');
        expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects when the hostname resolves to a private address', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '10.0.0.5' }]);
        await expect(assertSafeWebhookUrl('https://evil.example/hook')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
    });

    it('rejects when ANY resolved address is private', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34' }, { address: '127.0.0.1' }]);
        await expect(assertSafeWebhookUrl('https://mixed.example/hook')).rejects.toBeInstanceOf(
            UnsafeWebhookUrlError,
        );
    });

    it('accepts when the hostname resolves to a public address', async () => {
        lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34' }]);
        const url = await assertSafeWebhookUrl('https://good.example/hook');
        expect(url.href).toBe('https://good.example/hook');
    });

    it('allowPrivate lets http and loopback through for local dev', async () => {
        const url = await assertSafeWebhookUrl('http://127.0.0.1:8787/webhook', { allowPrivate: true });
        expect(url.href).toBe('http://127.0.0.1:8787/webhook');
        expect(lookupMock).not.toHaveBeenCalled();
    });
});
