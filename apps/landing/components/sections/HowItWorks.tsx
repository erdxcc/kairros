import { Reveal } from '@/components/effects/Reveal';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { howItWorks } from '@/lib/copy';

/**
 * The four steps as one connected block: 1px grid gaps over a `line`-coloured
 * wrapper become hairline dividers, so the steps read as a single rail rather
 * than four detached cards.
 */
export function HowItWorks() {
    return (
        <section id="how" className="border-t border-line-soft bg-canvas-alt">
            <div className="container-page section">
                <SectionHeader
                    eyebrow={howItWorks.eyebrow}
                    heading={howItWorks.heading}
                    width="max-w-[720px]"
                />

                <Reveal delay={120}>
                    <ol className="mt-13 grid list-none grid-cols-[repeat(auto-fit,minmax(min(232px,100%),1fr))] gap-px overflow-hidden rounded-[18px] border border-line bg-line p-0">
                        {howItWorks.steps.map((step, i) => (
                            <li key={step.title} className="bg-canvas-alt px-7 py-[34px]">
                                <span className="font-mono text-[30px] font-medium tracking-[-0.02em] text-accent">
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <span aria-hidden="true" className="my-4 block h-0.5 w-[26px] bg-line" />
                                <h3 className="mb-2.5 text-lg font-semibold tracking-[-0.01em]">
                                    {step.title}
                                </h3>
                                <p className="text-[14.5px] leading-[1.62] text-muted">{step.body}</p>
                            </li>
                        ))}
                    </ol>
                </Reveal>
            </div>
        </section>
    );
}
