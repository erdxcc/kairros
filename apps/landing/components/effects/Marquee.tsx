import { cn } from '@/lib/cn';

/**
 * Infinite horizontal marquee. The track is duplicated and translated -50% for
 * a seamless loop; pauses on hover; reduced-motion freezes it (globals.css).
 * Decorative, so the whole strip is aria-hidden.
 */
export function Marquee({
    items,
    className,
}: {
    items: readonly string[];
    className?: string;
}) {
    // Two passes of the same list scroll seamlessly; the pass index keeps the
    // duplicated labels distinct as React keys.
    const track = [...items.map((i) => `a:${i}`), ...items.map((i) => `b:${i}`)];
    return (
        <div className={cn('group relative overflow-hidden', className)} aria-hidden="true">
            <div className="marquee-track flex w-max [animation:var(--animate-marquee)] group-hover:[animation-play-state:paused]">
                {track.map((keyed) => (
                    <span
                        key={keyed}
                        className="flex shrink-0 items-center gap-2.5 px-7 text-[15px] font-medium text-fg-faint"
                    >
                        <span className="h-2 w-2 rounded-full [background-image:var(--gradient-brand)] opacity-70" />
                        {keyed.slice(2)}
                    </span>
                ))}
            </div>
        </div>
    );
}
