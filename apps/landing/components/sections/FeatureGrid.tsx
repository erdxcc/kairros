import { Reveal } from '@/components/effects/Reveal';
import { Glyph } from '@/components/ui/Glyph';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { features } from '@/lib/copy';
import { site } from '@/lib/site';

/**
 * What kairos adds on top of the on-chain program. Planned work shows up as
 * dimmed "soon" cards rather than being hidden, so the roadmap stays legible
 * without over-promising; `site.showPlanned` drops them entirely.
 */
export function FeatureGrid() {
    return (
        <section id="features" className="container-page section">
            <SectionHeader eyebrow={features.eyebrow} heading={features.heading} lead={features.lead} />

            <div className="mt-13 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
                {features.live.map((item, i) => (
                    <Reveal key={item.title} delay={i * 70} className="h-full">
                        <div className="h-full rounded-[16px] border border-line bg-surface p-7 transition-[border-color,background-color] duration-150 ease-out hover:border-line-hover hover:bg-surface-3">
                            <Glyph name={item.glyph} />
                            <h3 className="mb-2.5 text-lg font-semibold tracking-[-0.01em]">{item.title}</h3>
                            <p className="text-[14.5px] leading-relaxed text-muted">{item.body}</p>
                        </div>
                    </Reveal>
                ))}

                {site.showPlanned &&
                    features.planned.map((item, i) => (
                        <Reveal key={item.title} delay={(i + 3) * 70} className="h-full">
                            <div className="relative h-full rounded-[16px] border border-line-softer bg-nested-dim p-7">
                                <span className="absolute right-5 top-5 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.08em] text-warning">
                                    {features.soonLabel}
                                </span>
                                <Glyph name={item.glyph} planned />
                                <h3 className="mb-2.5 text-lg font-semibold tracking-[-0.01em] text-fg-soft">
                                    {item.title}
                                </h3>
                                <p className="text-[14.5px] leading-relaxed text-faint">{item.body}</p>
                            </div>
                        </Reveal>
                    ))}
            </div>
        </section>
    );
}
