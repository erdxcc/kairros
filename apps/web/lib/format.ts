/**
 * Display formatters for the dashboard. Token amounts arrive as base-unit
 * strings (u64-safe); we render them with a fixed decimals assumption — most
 * SPL tokens, including USDC, use 6. (Per-mint symbol/decimals metadata is a
 * later enhancement; the schema does not store decimals yet.)
 */
export const DEFAULT_DECIMALS = 6;
export const EXPLORER_CLUSTER = 'devnet';

/** base units -> human string, e.g. "10000000" -> "10.00" (6 decimals). */
export function formatAmount(raw: string | number | bigint, decimals = DEFAULT_DECIMALS): string {
    let value: bigint;
    try {
        const s = typeof raw === 'string' ? (raw.split('.')[0] ?? '0') : raw;
        value = BigInt(s);
    } catch {
        return String(raw);
    }
    const negative = value < 0n;
    if (negative) value = -value;
    const base = 10n ** BigInt(decimals);
    const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (decimals === 0) return (negative ? '-' : '') + whole;
    const frac = (value % base).toString().padStart(decimals, '0').slice(0, 2);
    return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Period length in hours -> a friendly cadence label. */
export function formatPeriod(hours: string | number | bigint): string {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return `${hours}h`;
    const exact: Record<number, string> = {
        1: 'hourly',
        24: 'daily',
        168: 'weekly',
        720: 'monthly',
        730: 'monthly',
        744: 'monthly',
        2160: 'quarterly',
        8760: 'yearly',
    };
    if (exact[h]) return exact[h];
    if (h % 168 === 0) return `every ${h / 168} weeks`;
    if (h % 24 === 0) return `every ${h / 24} days`;
    return `every ${h} hours`;
}

/** Truncate a base58 address for compact display: "9F1U…rxZM". */
export function short(address: string | null | undefined, edge = 4): string {
    if (!address) return '—';
    if (address.length <= edge * 2 + 1) return address;
    return `${address.slice(0, edge)}…${address.slice(-edge)}`;
}

function toDate(input: string | number | Date | null | undefined): Date | null {
    if (input === null || input === undefined) return null;
    if (input instanceof Date) return input;
    // Unix seconds come as numeric strings/numbers; ISO timestamps as strings.
    if (typeof input === 'number') return new Date(input * 1000);
    if (/^\d+$/.test(input)) return new Date(Number(input) * 1000);
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

export function formatDateTime(input: string | number | Date | null | undefined): string {
    const d = toDate(input);
    return d ? DATE_FMT.format(d) : '—';
}

export function formatDate(input: string | number | Date | null | undefined): string {
    const d = toDate(input);
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

/** Compact relative time, e.g. "2h ago", "3d ago". */
export function relativeTime(input: string | number | Date | null | undefined): string {
    const d = toDate(input);
    if (!d) return '—';
    const seconds = Math.round((Date.now() - d.getTime()) / 1000);
    const abs = Math.abs(seconds);
    const units: Array<[number, string]> = [
        [60, 's'],
        [3600, 'm'],
        [86400, 'h'],
        [2592000, 'd'],
        [31536000, 'mo'],
    ];
    if (abs < 60) return 'just now';
    for (let i = units.length - 1; i >= 0; i--) {
        const entry = units[i];
        if (!entry) continue;
        const [threshold, label] = entry;
        if (abs >= threshold) {
            const n = Math.floor(abs / threshold);
            return seconds >= 0 ? `${n}${label} ago` : `in ${n}${label}`;
        }
    }
    return 'just now';
}

export function formatPercent(ratio: number, digits = 1): string {
    if (!Number.isFinite(ratio)) return '—';
    return `${(ratio * 100).toFixed(digits)}%`;
}

export function explorerTx(signature: string): string {
    return `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}

export function explorerAddress(address: string): string {
    return `https://explorer.solana.com/address/${address}?cluster=${EXPLORER_CLUSTER}`;
}
