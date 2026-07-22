import { cn } from '@/lib/cn';
import { ecosystem } from '@/lib/copy';

/**
 * Thin band naming the primitives kairos is built on, sitting between the trust
 * block and the closing CTA. Text wordmarks rather than logos: these stay
 * placeholders until we have permission to use real marks.
 *
 * Only a top border: the CTA below brings its own, and two hairlines meeting
 * would read as one 2px line.
 */
export function EcosystemRow() {
    return (
        <section className="border-t border-line-soft bg-canvas-alt">
            <div className="container-page flex flex-wrap items-center justify-center gap-9 py-[30px]">
                <span className="flex-none font-mono text-[11px] uppercase tracking-[0.14em] text-fainter">
                    {ecosystem.eyebrow}
                </span>
                <div className="flex flex-wrap items-center justify-center gap-[30px]">
                    {ecosystem.marks.map((mark) => (
                        <span
                            key={mark.label}
                            className={cn(
                                'text-faint',
                                mark.mono ? 'font-mono text-sm' : 'text-[15px] font-medium',
                            )}
                        >
                            {mark.label}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
