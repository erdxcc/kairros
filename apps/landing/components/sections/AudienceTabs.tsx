"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/effects/Reveal";
import { audiences, audienceSection, type AudienceId } from "@/lib/copy";

export function AudienceTabs() {
  const [active, setActive] = useState<AudienceId>(audiences[0].id);
  const items = audiences.map((a) => ({ id: a.id, label: a.tab }));

  return (
    <section className="section">
      <div className="container-page">
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <h2 className="text-balance text-[clamp(1.8rem,3.4vw,2.7rem)] font-semibold leading-tight">
              {audienceSection.heading}
            </h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mt-4 max-w-xl text-pretty text-base text-fg-muted md:text-lg">
              {audienceSection.subheading}
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-8">
              <Tabs
                items={items}
                value={active}
                onValueChange={(id) => setActive(id as AudienceId)}
                idBase="audience"
                label="Choose your audience"
              />
            </div>
          </Reveal>
        </div>

        <div key={active} className="panel-fade mt-12">
          {audiences.map((audience) => (
            <div
              key={audience.id}
              role="tabpanel"
              id={`audience-panel-${audience.id}`}
              aria-labelledby={`audience-tab-${audience.id}`}
              hidden={audience.id !== active}
            >
              <div className="grid gap-10 rounded-[var(--radius-card)] border border-border bg-surface p-8 md:p-12 lg:grid-cols-2 lg:items-center">
                <div>
                  <h3 className="text-balance text-2xl font-semibold tracking-tight md:text-[28px]">
                    {audience.title}
                  </h3>
                  <p className="mt-4 text-pretty leading-relaxed text-fg-muted">
                    {audience.body}
                  </p>
                  <div className="mt-8">
                    <Button href={audience.cta.href} size="lg">
                      {audience.cta.label}
                    </Button>
                  </div>
                </div>

                <ul className="grid gap-3">
                  {audience.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3.5 text-sm text-fg"
                    >
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-3/15 text-accent-3">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path
                            d="M2.5 6.5l2.5 2.5 4.5-5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
