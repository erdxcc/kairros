'use client';

import { explorerAddress, explorerTx, short } from '@/lib/format';
import { type ButtonHTMLAttributes, type ReactNode, useState } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from './icons';

export function cn(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}

// ---- Card ----

export function Card({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={cn('rounded-xl border border-line bg-surface', className)}>{children}</div>;
}

export function CardHeader({
    title,
    description,
    action,
}: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-4 border-line-soft border-b px-5 py-4">
            <div>
                <h3 className="font-medium text-fg text-sm">{title}</h3>
                {description ? <p className="mt-0.5 text-faint text-xs">{description}</p> : null}
            </div>
            {action}
        </div>
    );
}

// ---- Button ----

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
};

export function Button({ variant = 'secondary', size = 'md', className, children, ...props }: ButtonProps) {
    const base =
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
    const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-9 px-4 text-sm' };
    const variants = {
        primary: 'bg-accent text-white hover:bg-accent-hover',
        secondary: 'border border-line bg-surface-2 text-fg hover:border-faint',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border border-danger/30 bg-danger-soft text-danger hover:border-danger/60',
    };
    return (
        <button type="button" className={cn(base, sizes[size], variants[variant], className)} {...props}>
            {children}
        </button>
    );
}

// ---- Badge / status ----

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning';

const toneClasses: Record<Tone, string> = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium text-xs',
                toneClasses[tone],
            )}
        >
            {children}
        </span>
    );
}

const statusTone: Record<string, Tone> = {
    active: 'success',
    succeeded: 'success',
    cancelled: 'warning',
    canceled: 'warning',
    sunset: 'warning',
    failed: 'danger',
    past_due: 'danger',
};

export function StatusBadge({ status }: { status: string }) {
    const tone = statusTone[status] ?? 'neutral';
    return (
        <Badge tone={tone}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status.replace(/_/g, ' ')}
        </Badge>
    );
}

// ---- Loading / empty / error ----

export function Spinner({ className }: { className?: string }) {
    return (
        <svg
            className={cn('animate-spin', className)}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
            <p className="font-medium text-fg text-sm">{title}</p>
            {hint ? <p className="max-w-sm text-faint text-xs">{hint}</p> : null}
        </div>
    );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
    const message = error instanceof Error ? error.message : 'Something went wrong';
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <p className="font-medium text-danger text-sm">{message}</p>
            {onRetry ? (
                <Button size="sm" onClick={onRetry}>
                    Retry
                </Button>
            ) : null}
        </div>
    );
}

// ---- Copy + explorer links ----

export function CopyButton({ value, label }: { value: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                navigator.clipboard?.writeText(value).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                });
            }}
            className="-m-1 inline-flex items-center justify-center rounded-md p-2 text-faint transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label={label ?? 'Copy'}
        >
            {copied ? <CheckIcon width={16} height={16} className="text-success" /> : <CopyIcon />}
        </button>
    );
}

export function AddressLink({
    value,
    kind = 'address',
    edge = 4,
}: {
    value: string | null | undefined;
    kind?: 'address' | 'tx';
    edge?: number;
}) {
    if (!value) return <span className="text-faint">—</span>;
    const href = kind === 'tx' ? explorerTx(value) : explorerAddress(value);
    return (
        <span className="inline-flex items-center gap-1.5">
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                title={value}
                className="inline-flex items-center gap-1 rounded font-mono text-muted text-xs transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
                {short(value, edge)}
                <ExternalLinkIcon width={12} height={12} className="opacity-60" />
            </a>
            <CopyButton value={value} />
        </span>
    );
}

// ---- Page + table scaffolding ----

export function PageHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 className="font-semibold text-fg text-xl tracking-tight">{title}</h1>
                {description ? <p className="mt-1 text-muted text-sm">{description}</p> : null}
            </div>
            {actions}
        </div>
    );
}

export function StatCard({
    label,
    value,
    sub,
    loading,
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    loading?: boolean;
}) {
    return (
        <Card className="p-5">
            <p className="text-faint text-xs uppercase tracking-wider">{label}</p>
            {loading ? (
                <Skeleton className="mt-2 h-7 w-24" />
            ) : (
                <p className="mt-2 font-mono font-semibold text-2xl text-fg tabular tracking-tight">
                    {value}
                </p>
            )}
            {sub && !loading ? <p className="mt-1 text-faint text-xs">{sub}</p> : null}
        </Card>
    );
}

export function Table({ children }: { children: ReactNode }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
        </div>
    );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
    return (
        <th
            className={cn(
                'whitespace-nowrap px-5 py-2.5 text-left font-medium text-faint text-xs uppercase tracking-wider',
                className,
            )}
        >
            {children}
        </th>
    );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
    return <td className={cn('whitespace-nowrap px-5 py-3 align-middle', className)}>{children}</td>;
}

export function Tr({ children }: { children: ReactNode }) {
    return <tr className="border-line-soft border-t transition-colors hover:bg-surface-2/40">{children}</tr>;
}
