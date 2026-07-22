import { Reveal } from '@/components/effects/Reveal';
import { Button, ButtonArrow } from '@/components/ui/Button';
import { cta } from '@/lib/copy';

/**
 * Closing ask. The accent glow rises from the bottom edge so the page finishes
 * on the brand colour rather than fading out.
 */
export function CtaBand() {
    return (
        <section className="relative overflow-hidden border-t border-line-soft bg-[radial-gradient(80%_120%_at_50%_120%,rgba(124,108,255,0.14),transparent_60%)]">
            <div className="container-page mx-auto max-w-[820px] py-[clamp(80px,10vw,140px)] text-center">
                <Reveal>
                    <h2 className="text-[clamp(32px,4.6vw,58px)] font-semibold leading-[1.04] tracking-[-0.03em]">
                        {cta.heading}
                    </h2>
                </Reveal>
                <Reveal delay={80}>
                    <p className="mx-auto mt-[22px] max-w-[40ch] text-[clamp(16px,1.7vw,19px)] leading-relaxed text-muted">
                        {cta.lead}
                    </p>
                </Reveal>
                <Reveal delay={150}>
                    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                        <Button href={cta.primary.href} size="md">
                            {cta.primary.label}
                            <ButtonArrow />
                        </Button>
                        <Button href={cta.secondary.href} variant="ghost" size="md">
                            {cta.secondary.label}
                        </Button>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
