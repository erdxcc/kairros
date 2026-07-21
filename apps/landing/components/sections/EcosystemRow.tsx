import { Marquee } from "@/components/effects/Marquee";
import { Reveal } from "@/components/effects/Reveal";
import { ecosystem } from "@/lib/copy";

export function EcosystemRow() {
  return (
    <section className="border-y border-border/60 py-14">
      <div className="container-page">
        <Reveal>
          <p className="text-center text-sm text-fg-faint">{ecosystem.caption}</p>
        </Reveal>
        <Reveal delay={80}>
          <div className="mt-8 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <Marquee items={ecosystem.marks} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
