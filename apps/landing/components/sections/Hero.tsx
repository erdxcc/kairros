import { SilkBackground } from "@/components/effects/SilkBackground";
import { Reveal } from "@/components/effects/Reveal";
import { Button } from "@/components/ui/Button";
import { hero } from "@/lib/copy";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Signature silk fluid background */}
      <SilkBackground className="absolute inset-0 -z-10" />

      {/* Scrim for text contrast (WCAG AA over the fluid) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_0%_25%,rgba(7,7,11,0.88),rgba(7,7,11,0.35)_45%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-bg"
      />

      <div className="pointer-events-none container-page flex min-h-[92vh] flex-col justify-center pb-24 pt-32">
        <Reveal>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full [background-image:var(--gradient-brand)]" />
            {hero.eyebrow}
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-5 max-w-4xl text-balance text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[1.02] tracking-tight">
            {hero.title}
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 max-w-2xl text-pretty text-[17px] leading-relaxed text-fg-muted md:text-lg">
            {hero.subhead}
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="pointer-events-auto mt-9 flex flex-wrap items-center gap-3">
            <Button href={hero.primary.href} size="lg">
              {hero.primary.label}
            </Button>
            <Button href={hero.secondary.href} variant="ghost" size="lg">
              {hero.secondary.label}
            </Button>
            <code className="ml-1 hidden items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2.5 font-mono text-[13px] text-fg-muted backdrop-blur sm:inline-flex">
              <span className="text-accent-3">$</span>
              {hero.install}
            </code>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
