import { Reveal } from '@/components/effects/Reveal';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { trust } from '@/lib/copy';
import { site } from '@/lib/site';

/**
 * Why the money is safe, stated plainly. Same connected-grid treatment as
 * "How it works", with the real program id underneath so the claims are
 * checkable rather than asserted.
 */
export function TrustBand() {
    return (
        <section id="security" className="border-t border-line-soft bg-canvas-alt">
            <div className="container-page section">
                <SectionHeader eyebrow={trust.eyebrow} heading={trust.heading} width="max-w-[720px]" />

                <Reveal delay={120}>
                    <div className="mt-13 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-px overflow-hidden rounded-[18px] border border-line bg-line">
                        {trust.items.map((item) => (
                            <div key={item.title} className="bg-canvas-alt px-[30px] py-[34px]">
                                <h3 className="mb-3 text-[19px] font-semibold tracking-[-0.01em]">
                                    {item.title}
                                </h3>
                                <p className="text-[15px] leading-[1.62] text-muted">{item.body}</p>
                                {'link' in item && item.link ? (
                                    <a
                                        href={item.link.href}
                                        className="mt-4 inline-block font-mono text-[13px] text-accent transition-colors duration-150 hover:text-accent-hover"
                                    >
                                        {item.link.label}
                                    </a>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </Reveal>

                <Reveal delay={200}>
                    <div className="mt-5 flex flex-wrap items-center gap-3.5 rounded-[10px] border border-line-soft bg-nested px-4 py-3 font-mono text-xs">
                        <span className="uppercase tracking-[0.08em] text-faint">{trust.programIdLabel}</span>
                        <span className="break-all text-muted">{site.programId}</span>
                        <span className="text-faintest">{trust.programIdNote}</span>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
