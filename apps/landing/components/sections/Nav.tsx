'use client';

import { Button, ButtonArrow } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { NetworkBadge } from '@/components/ui/NetworkBadge';
import { cn } from '@/lib/cn';
import { nav } from '@/lib/copy';
import { site } from '@/lib/site';
import { useEffect, useState } from 'react';

/**
 * Fixed nav. Transparent over the hero so the silk field runs edge to edge
 * behind it, then picks up a blurred backdrop once the page scrolls and the
 * links would otherwise sit on top of cards. Fixed rather than sticky: a
 * sticky bar holds its own row in the flow, so a transparent one would show
 * the page background instead of the hero. The links collapse into a
 * slide-down panel below `lg`, where five of them plus two buttons stop
 * fitting on one row.
 */
export function Nav() {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Close the panel when the layout crosses back into the desktop row.
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = () => mq.matches && setOpen(false);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    return (
        <header
            className={cn(
                'fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300',
                // The open mobile panel needs the backdrop even at the top.
                scrolled || open
                    ? 'border-line-soft bg-canvas/70 backdrop-blur-[14px]'
                    : 'border-transparent',
            )}
        >
            <nav aria-label="Primary" className="container-page flex items-center gap-6 py-3.5">
                <Logo>
                    <NetworkBadge network={site.network} className="ml-0.5" />
                </Logo>

                <div className="hidden flex-1 flex-wrap justify-center gap-[30px] lg:flex">
                    {nav.links.map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            className="text-sm text-muted transition-colors duration-150 hover:text-fg"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                <div className="ml-auto hidden flex-none items-center gap-2.5 lg:flex">
                    <Button href={nav.signIn.href} variant="ghost">
                        {nav.signIn.label}
                    </Button>
                    <Button href={nav.start.href}>
                        {nav.start.label}
                        <ButtonArrow />
                    </Button>
                </div>

                <button
                    type="button"
                    className="ml-auto inline-flex size-10 flex-none items-center justify-center rounded-[9px] border border-line text-fg transition-colors duration-150 hover:bg-surface-2 lg:hidden"
                    aria-label={open ? 'Close menu' : 'Open menu'}
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

            <div
                id="mobile-menu"
                className={cn(
                    'overflow-hidden border-t border-line-soft transition-[max-height,opacity] duration-300 ease-[var(--ease-out-soft)] lg:hidden',
                    open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
                )}
            >
                <div className="container-page flex flex-col gap-1 py-4">
                    {nav.links.map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="rounded-lg px-2 py-2.5 text-[15px] text-muted transition-colors duration-150 hover:bg-surface hover:text-fg"
                        >
                            {link.label}
                        </a>
                    ))}
                    <div className="mt-2 flex gap-2.5">
                        <Button href={nav.signIn.href} variant="ghost" className="flex-1">
                            {nav.signIn.label}
                        </Button>
                        <Button href={nav.start.href} className="flex-1">
                            {nav.start.label}
                            <ButtonArrow />
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
