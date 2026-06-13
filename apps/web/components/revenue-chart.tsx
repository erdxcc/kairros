'use client';

import { formatAmount, formatDate } from '@/lib/format';
import { EmptyState } from './ui';

interface Point {
    day: string;
    amount: string;
}

const W = 600;
const H = 160;
const PAD = 10;

/**
 * Lightweight responsive area chart for the 30-day revenue series. Hand-rolled
 * SVG (no chart dependency); `vector-effect=non-scaling-stroke` keeps strokes
 * crisp when the viewBox stretches to the container width.
 */
export function RevenueChart({ series }: { series: Point[] }) {
    if (series.length === 0) {
        return (
            <EmptyState title="No revenue yet" hint="Successful charges in the last 30 days appear here." />
        );
    }

    const values = series.map((p) => Number(p.amount));
    const max = Math.max(...values, 1);
    const n = series.length;
    const x = (i: number) => (n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD));
    const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);

    const line = values
        .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

    return (
        <div className="px-2 pt-2 pb-1">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-44 w-full"
                role="img"
                aria-label="Daily revenue over the last 30 days"
            >
                <title>Daily revenue, last 30 days</title>
                <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={area} fill="url(#revFill)" />
                <path
                    d={line}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            <div className="flex justify-between px-1 pt-1 text-faint text-xs">
                <span>{formatDate(series[0]?.day)}</span>
                <span className="tabular">peak {formatAmount(String(max))}</span>
                <span>{formatDate(series[n - 1]?.day)}</span>
            </div>
        </div>
    );
}
