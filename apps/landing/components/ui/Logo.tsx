import { cn } from "@/lib/cn";

/**
 * Original placeholder wordmark for Kairos: a gradient mark (an abstract
 * hourglass nodding to "kairos" = the opportune moment) plus the name.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <a
      href="#"
      aria-label="Kairos — home"
      className={cn(
        "inline-flex items-center gap-2.5 text-fg transition-opacity hover:opacity-90",
        className,
      )}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="kairos-mark" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="0.55" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#14f195" />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="22"
          height="22"
          rx="7"
          fill="url(#kairos-mark)"
          opacity="0.16"
        />
        <path
          d="M7 6l10 12M17 6L7 18"
          stroke="url(#kairos-mark)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="1.6" fill="url(#kairos-mark)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Kairos</span>
    </a>
  );
}
