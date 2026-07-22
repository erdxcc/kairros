import { Reveal } from '@/components/effects/Reveal';
import { SilkBackground } from '@/components/effects/SilkBackground';
import { Button, ButtonArrow } from '@/components/ui/Button';
import { hero } from '@/lib/copy';

/**
 * The signature section: a live Stable-Fluids silk field with the positioning
 * statement over it. The WebGL solver and its reduced-motion / mobile fallbacks
 * live in components/effects/SilkBackground.tsx and lib/silk/.
 *
 * Sized in `dvh`, not `vh`: on mobile the browser chrome shrinks the viewport,
 * and `vh` would leave the hero taller than the screen it is meant to fill.
 */
export function Hero() {
    return (
        <section id="top" className="relative isolate flex min-h-dvh items-center overflow-hidden">
            <SilkBackground className="absolute inset-0 -z-10" />

            {/* Scrim for text contrast (WCAG AA over the moving fluid) */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_25%,rgba(10,10,14,0.9),rgba(10,10,14,0.35)_45%,transparent_70%)]"
            />
            {/* Fade the field into the canvas so the next section starts with no
                seam. Kept shallow: any taller and it reads as a dark band across
                the bottom of the hero rather than a transition. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-b from-transparent to-canvas"
            />

            {/* Extra top padding clears the floating nav on short viewports. */}
            <div className="container-page pointer-events-none pb-24 pt-32">
                <Reveal>
                    <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.14em] text-faint">
                        <span aria-hidden="true" className="text-accent">
                            •
                        </span>
                        {hero.eyebrow}
                    </p>
                </Reveal>

                <Reveal delay={80}>
                    <h1 className="mt-5 max-w-[15ch] text-[clamp(2.5rem,6.4vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
                        {hero.title}
                    </h1>
                </Reveal>

                <Reveal delay={160}>
                    <p className="mt-6 max-w-[46ch] text-[clamp(16px,1.7vw,19px)] leading-relaxed text-muted">
                        {hero.subhead}
                    </p>
                </Reveal>

                <Reveal delay={240}>
                    <div className="pointer-events-auto mt-9 flex flex-wrap items-center gap-3">
                        <Button href={hero.primary.href} size="md">
                            {hero.primary.label}
                            <ButtonArrow />
                        </Button>
                        <Button href={hero.secondary.href} variant="ghost" size="md">
                            {hero.secondary.label}
                        </Button>
                        <code className="ml-1 hidden items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-2.5 font-mono text-[13px] text-muted backdrop-blur sm:inline-flex">
                            <span className="text-success">$</span>
                            {hero.install}
                        </code>
                    </div>
                </Reveal>
            </div>

            <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-faintest md:flex"
            >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{hero.scroll}</span>
                <span className="h-[26px] w-px bg-gradient-to-b from-faintest to-transparent" />
            </div>
        </section>
    );
}
