"use client";

import type { CSSProperties, ReactNode } from "react";
import { useInView } from "@/lib/useInView";
import { cn } from "@/lib/cn";

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms (applied as transition-delay). */
  delay?: number;
}

/**
 * Reveal-on-scroll wrapper. Adds `.in-view` when the element enters the
 * viewport; the actual fade + rise lives in globals.css ([data-reveal]), where
 * reduced-motion turns it into an instant no-op.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-reveal
      className={cn(inView && "in-view", className)}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
