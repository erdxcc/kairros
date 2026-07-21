import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/effects/Reveal";
import { features } from "@/lib/copy";

export function FeatureGrid() {
  return (
    <section id="features" className="section">
      <div className="container-page">
        <div className="max-w-2xl">
          <Reveal>
            <h2 className="text-balance text-[clamp(1.8rem,3.4vw,2.7rem)] font-semibold leading-tight">
              {features.heading}
            </h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mt-4 text-pretty text-base leading-relaxed text-fg-muted md:text-lg">
              {features.subheading}
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.items.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 80}>
              <Card className="h-full p-6">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-accent-2">
                  <Icon name={feature.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-[17px] font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                  {feature.body}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
