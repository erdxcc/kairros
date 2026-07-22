import { Reveal } from '@/components/effects/Reveal';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/**
 * Mono eyebrow led by an accent bullet. Shared by every section so the
 * uppercase tracking and colour live in one place.
 */
export function Eyebrow({
    children,
    badge,
    className,
}: {
    children: ReactNode;
    /** Optional pill after the label, e.g. the "preview" tag on planned work. */
    badge?: ReactNode;
    className?: string;
}) {
    return (
        <p
            className={cn(
                'flex flex-wrap items-center gap-2.5 font-mono text-xs uppercase tracking-[0.14em] text-faint',
                className,
            )}
        >
            <span aria-hidden="true" className="text-accent">
                •
            </span>
            {children}
            {badge}
        </p>
    );
}

/** Small mono pill used for honest "preview" / "soon" tagging. */
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 font-mono text-[10px] normal-case tracking-[0.08em] text-warning',
                className,
            )}
        >
            {children}
        </span>
    );
}

export interface SectionHeaderProps {
    eyebrow: string;
    heading: string;
    lead?: string;
    badge?: ReactNode;
    className?: string;
    /** Tailwind max-width for the block. Headers run 720-760px in the design. */
    width?: string;
}

export function SectionHeader({
    eyebrow,
    heading,
    lead,
    badge,
    className,
    width = 'max-w-[760px]',
}: SectionHeaderProps) {
    return (
        <div className={cn(width, className)}>
            <Reveal>
                <Eyebrow badge={badge}>{eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
                <h2 className="mt-5 text-[clamp(30px,4.2vw,52px)] font-semibold leading-[1.05] tracking-[-0.028em]">
                    {heading}
                </h2>
            </Reveal>
            {lead ? (
                <Reveal delay={140}>
                    <p className="mt-[22px] max-w-[54ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-muted">
                        {lead}
                    </p>
                </Reveal>
            ) : null}
        </div>
    );
}
