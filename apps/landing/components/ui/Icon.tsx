import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type IconName = "repeat" | "shield" | "bolt" | "code";

/** Original line icons (24px stroke), no external icon library. */
const PATHS: Record<IconName, ReactNode> = {
  repeat: (
    <>
      <path d="M4 9a6 6 0 0 1 6-6h6" />
      <path d="M14 1l3 2-3 2" />
      <path d="M20 15a6 6 0 0 1-6 6H8" />
      <path d="M10 23l-3-2 3-2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  bolt: <path d="M13 2L5 13h6l-2 9 9-12h-6l1-8z" />,
  code: (
    <>
      <path d="M8 8l-4 4 4 4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M13 5l-2 14" />
    </>
  ),
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      {PATHS[name]}
    </svg>
  );
}
