import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps {
  className?: string;
  children: ReactNode;
  /** Render the hover sheen overlay. Defaults to true. */
  sheen?: boolean;
}

/**
 * Raised surface with a thin border and an optional hover/focus sheen — a soft
 * highlight that sweeps across the card (CSS keyframes, see globals.css).
 */
export function Card({ className, children, sheen = true }: CardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface transition-colors duration-300 hover:border-border-strong",
        className,
      )}
    >
      {sheen && (
        <span
          aria-hidden="true"
          className="card-sheen pointer-events-none absolute inset-y-0 -left-1/3 z-0 w-1/2 opacity-0 [background:linear-gradient(100deg,transparent,rgba(255,255,255,0.10),transparent)]"
        />
      )}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
