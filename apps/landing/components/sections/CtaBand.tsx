import { Reveal } from "@/components/effects/Reveal";
import { Button } from "@/components/ui/Button";
import { cta } from "@/lib/copy";

export function CtaBand() {
  return (
    <section className="section">
      <div className="container-page">
        <div className="relative isolate overflow-hidden rounded-[28px] border border-border px-6 py-20 text-center sm:px-12">
          {/* Calm static silk gradient (same palette) — no second WebGL context. */}
          <div
            aria-hidden="true"
            className="silk-fallback absolute inset-0 -z-10 opacity-60"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(120%_120%_at_50%_-10%,transparent,rgba(7,7,11,0.65))]"
          />

          <Reveal>
            <h2 className="mx-auto max-w-2xl text-balance text-[clamp(2rem,4.4vw,3.2rem)] font-semibold leading-[1.05]">
              {cta.heading}
            </h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-fg-muted md:text-lg">
              {cta.subheading}
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {cta.actions.map((action) => (
                <Button
                  key={action.label}
                  href={action.href}
                  variant={action.variant === "solid" ? "solid" : "ghost"}
                  size="lg"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-fg-faint">
              {cta.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="transition hover:text-fg"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
