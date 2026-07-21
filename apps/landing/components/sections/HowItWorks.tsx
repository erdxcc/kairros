"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/effects/Reveal";
import { howItWorks } from "@/lib/copy";
import { cn } from "@/lib/cn";

/** Original mock-UI placeholders, one per step (no external assets). */
function StepArt({ index }: { index: number }) {
  const frame =
    "absolute inset-0 flex flex-col justify-center gap-3 rounded-2xl border border-border bg-[#0b0b12] p-7";

  if (index === 0) {
    return (
      <div className={frame}>
        <p className="font-mono text-xs text-fg-faint">Spending limit</p>
        <p className="text-3xl font-semibold tracking-tight">100 USDC</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-1/3 rounded-full [background-image:var(--gradient-brand)]" />
        </div>
        <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-fg-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-3" /> Approve · revocable
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className={frame}>
        <p className="font-mono text-xs text-fg-faint">Next charge</p>
        <p className="text-2xl font-semibold tracking-tight">20 USDC · in 6 days</p>
        <div className="mt-1 flex items-center gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < 3 ? "[background-image:var(--gradient-brand)]" : "bg-surface-2",
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-muted">Within the approved limit · non-custodial</p>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className={frame}>
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-accent-3/15 px-3 py-1 text-xs text-accent-3">
          Settled · ~400ms
        </div>
        <p className="font-mono text-xs leading-relaxed text-fg-muted">
          sig 5jK2…q9Vd
          <br />
          slot 284,119,402
        </p>
        <p className="text-sm text-fg">Verifiable on-chain · no chargebacks</p>
      </div>
    );
  }

  return (
    <div className={frame}>
      <p className="font-mono text-xs text-fg-faint">This month</p>
      <div className="flex items-end gap-6">
        <div>
          <p className="text-2xl font-semibold tracking-tight">$48.2k</p>
          <p className="text-xs text-fg-muted">Collected</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight">2,410</p>
          <p className="text-xs text-fg-muted">Active</p>
        </div>
      </div>
      <div className="mt-2 flex h-10 items-end gap-1">
        {[5, 8, 6, 9, 7, 11, 9, 13].map((h, i) => (
          <span
            key={i}
            className="w-full rounded-sm [background-image:var(--gradient-brand)]"
            style={{ height: `${h * 7}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const stepsRef = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            setActive(index);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const el of stepsRef.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section className="section">
      <div className="container-page">
        <div className="max-w-2xl">
          <Reveal>
            <h2 className="text-balance text-[clamp(1.8rem,3.4vw,2.7rem)] font-semibold leading-tight">
              {howItWorks.heading}
            </h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mt-4 text-pretty text-base leading-relaxed text-fg-muted md:text-lg">
              {howItWorks.subheading}
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-2">
          {/* Sticky media column (desktop) */}
          <div className="hidden lg:block">
            <div className="sticky top-28">
              <div className="relative aspect-[4/3] w-full">
                {howItWorks.steps.map((step, i) => (
                  <div
                    key={step.title}
                    className={cn(
                      "transition-opacity duration-500",
                      active === i ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden={active !== i}
                  >
                    <StepArt index={i} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          <ol className="relative">
            {howItWorks.steps.map((step, i) => (
              <li
                key={step.title}
                data-index={i}
                ref={(el) => {
                  stepsRef.current[i] = el;
                }}
                className="border-l border-border pb-14 pl-7 last:pb-0 lg:flex lg:min-h-[58vh] lg:flex-col lg:justify-center"
              >
                {/* Inline media on mobile (accessible stack, no sticky) */}
                <div className="relative mb-6 aspect-[4/3] w-full lg:hidden">
                  <StepArt index={i} />
                </div>

                <div
                  className={cn(
                    "transition-opacity duration-300",
                    active === i ? "opacity-100" : "lg:opacity-40",
                  )}
                >
                  <span className="font-mono text-sm text-accent-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-md text-pretty leading-relaxed text-fg-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
