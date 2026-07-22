import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/**
 * The kairos mark: an accent tile holding a broken ring, a "cycle" glyph for the
 * recurring charge. Pure CSS shapes, so it costs no asset request and follows
 * the accent token wherever it moves.
 */
export function LogoMark({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex size-[27px] flex-none items-center justify-center rounded-lg bg-accent',
                className,
            )}
        >
            <span className="size-3 rotate-[-20deg] rounded-full border-2 border-canvas/90 border-t-transparent" />
        </span>
    );
}

export function Logo({
    className,
    href = '#top',
    children,
}: {
    className?: string;
    href?: string;
    /** Slot after the wordmark, so the nav can sit a network badge beside it. */
    children?: ReactNode;
}) {
    return (
        <a
            href={href}
            aria-label="kairos home"
            className={cn('flex flex-none items-center gap-[11px] text-fg', className)}
        >
            <LogoMark />
            <span className="text-lg font-semibold tracking-[-0.02em]">kairos</span>
            {children}
        </a>
    );
}
