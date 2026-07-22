import { cn } from '@/lib/cn';
import type { Network } from '@/lib/site';

export interface NetworkBadgeProps {
    network: Network;
    /** Extra text after the cluster name, e.g. "· MVP". */
    suffix?: string;
    /** Breathe the status dot. Off inside the static dashboard mockup. */
    pulse?: boolean;
    className?: string;
}

/**
 * Cluster indicator. devnet reads as `warning` (this is not real money yet),
 * mainnet as `success`. The dot's pulse is switched off under reduced-motion by
 * the `.status-dot` rule in globals.css.
 */
export function NetworkBadge({ network, suffix, pulse = true, className }: NetworkBadgeProps) {
    const isMainnet = network === 'mainnet';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[10.5px] tracking-[0.05em]',
                isMainnet
                    ? 'border-success/10 bg-success/10 text-success'
                    : 'border-warning/10 bg-warning/10 text-warning',
                className,
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'size-[5px] rounded-full',
                    isMainnet ? 'bg-success' : 'bg-warning',
                    pulse && 'status-dot',
                )}
            />
            {suffix ? `${network} ${suffix}` : network}
        </span>
    );
}
