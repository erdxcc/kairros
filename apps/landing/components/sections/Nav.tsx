"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { nav } from "@/lib/copy";
import { cn } from "@/lib/cn";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu when crossing into desktop layout.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled || open
          ? "border-b border-border bg-bg/70 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <nav
        aria-label="Primary"
        className="container-page flex h-16 items-center justify-between"
      >
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {nav.links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm text-fg-muted transition hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Button href={nav.signIn.href} variant="ghost" size="sm">
            {nav.signIn.label}
          </Button>
          <Button href={nav.start.href} variant="solid" size="sm">
            {nav.start.label}
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-fg md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            {open ? (
              <path
                d="M4 4l10 10M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M3 5h12M3 9h12M3 13h12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile slide-down panel */}
      <div
        id="mobile-menu"
        className={cn(
          "overflow-hidden border-t border-border transition-[max-height,opacity] duration-300 ease-[var(--ease-out-soft)] md:hidden",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="container-page flex flex-col gap-1 py-4">
          {nav.links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-[15px] text-fg-muted transition hover:bg-surface hover:text-fg"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex gap-2">
            <Button href={nav.signIn.href} variant="ghost" size="md" className="flex-1">
              {nav.signIn.label}
            </Button>
            <Button href={nav.start.href} variant="solid" size="md" className="flex-1">
              {nav.start.label}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
