import { cn } from '@/lib/cn';

export type Tone = 'accent' | 'success';

const tile: Record<Tone, string> = {
    accent: 'border-accent/30 bg-accent/15',
    success: 'border-success/30 bg-success/15',
};

const dot: Record<Tone, string> = {
    accent: 'bg-accent',
    success: 'bg-success',
};

/**
 * Claim list with a tinted tick tile per row. The tile is a shape rather than a
 * checkmark glyph: it stays legible at 19px and needs no icon font.
 */
export function CheckList({
    items,
    tone = 'accent',
    className,
}: {
    items: readonly string[];
    tone?: Tone;
    className?: string;
}) {
    return (
        <ul className={cn('flex list-none flex-col gap-[13px] p-0', className)}>
            {items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-fg-soft">
                    <span
                        aria-hidden="true"
                        className={cn(
                            'mt-px flex size-[19px] flex-none items-center justify-center rounded-md border',
                            tile[tone],
                        )}
                    >
                        <span className={cn('size-1.5 rounded-[1.5px]', dot[tone])} />
                    </span>
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}
