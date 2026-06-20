import { Reveal } from "@/components/effects/Reveal";
import { trust } from "@/lib/copy";

export function TrustBand() {
  return (
    <section className="section">
      <div className="container-page">
        <Reveal>
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {trust.items.map((item) => (
              <div key={item.label} className="bg-surface p-7">
                <p className="text-[15px] font-semibold tracking-tight text-fg">
                  {item.label}
                </p>
                <p className="mt-2 text-sm text-fg-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
