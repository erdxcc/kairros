import { cn } from '@/lib/cn';
import type { FeatureGlyph } from '@/lib/copy';

/**
 * Feature glyphs drawn as CSS shapes rather than pulled from an icon library:
 * six marks is not worth a dependency. Every shape paints with `currentColor`,
 * so the tile below decides accent (live) or warning (planned) once.
 */
const SHAPES: Record<FeatureGlyph, React.ReactNode> = {
    // Dashboard: a 2x2 tile grid with one cell dimmed.
    grid: (
        <span className="grid size-4 grid-cols-2 gap-[3px]">
            <span className="rounded-[1.5px] bg-current" />
            <span className="rounded-[1.5px] bg-current" />
            <span className="rounded-[1.5px] bg-current" />
            <span className="rounded-[1.5px] bg-current opacity-40" />
        </span>
    ),
    // Automatic billing: an open ring, the recurring cycle.
    cycle: (
        <span className="size-[15px] rotate-[-45deg] rounded-full border-2 border-current border-r-transparent" />
    ),
    // Webhooks: three stacked bars, a payload.
    bars: (
        <span className="flex flex-col items-start gap-[3px]">
            <span className="h-[2.5px] w-4 rounded-sm bg-current" />
            <span className="h-[2.5px] w-2.5 rounded-sm bg-current" />
            <span className="h-[2.5px] w-[13px] rounded-sm bg-current" />
        </span>
    ),
    // Dunning: a ring broken twice, a retry.
    retry: (
        <span className="size-[15px] rounded-full border-2 border-current border-t-transparent border-l-transparent" />
    ),
    // Hosted checkout: a button outline.
    button: <span className="h-[13px] w-[21px] rounded border-2 border-current" />,
    // Telegram alerts: a send triangle.
    send: (
        <span
            className="size-0"
            style={{
                borderLeft: '11px solid currentColor',
                borderTop: '7px solid transparent',
                borderBottom: '7px solid transparent',
            }}
        />
    ),
};

export function Glyph({ name, planned = false }: { name: FeatureGlyph; planned?: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'mb-5 flex size-10 items-center justify-center rounded-[10px] border',
                planned
                    ? 'border-line-softer bg-nested-2 text-warning'
                    : 'border-line bg-surface-2 text-accent',
            )}
        >
            {SHAPES[name]}
        </span>
    );
}
