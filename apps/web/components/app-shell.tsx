'use client';

import { useAuth } from '@/lib/auth-client';
import { short } from '@/lib/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import {
    LogOutIcon,
    Logo,
    OverviewIcon,
    PaymentsIcon,
    PlansIcon,
    SettingsIcon,
    SubscribersIcon,
} from './icons';
import { SignIn } from './sign-in';
import { Spinner, cn } from './ui';

const NAV = [
    { href: '/', label: 'Overview', icon: OverviewIcon },
    { href: '/plans', label: 'Plans', icon: PlansIcon },
    { href: '/subscribers', label: 'Subscribers', icon: SubscribersIcon },
    { href: '/payments', label: 'Payments', icon: PaymentsIcon },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
    const { session, signOut } = useAuth();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    // Session hydrates in an effect; render a neutral splash until then so a
    // valid session never flashes the sign-in screen on refresh.
    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-canvas text-faint">
                <Spinner />
            </div>
        );
    }

    if (!session) return <SignIn />;

    return (
        <div className="flex min-h-dvh bg-canvas">
            <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-line border-r bg-surface/40 p-3 md:flex">
                <div className="flex items-center gap-2.5 px-2 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                        <Logo width={18} height={18} />
                    </div>
                    <span className="font-semibold text-fg tracking-tight">kairos</span>
                </div>

                <nav className="mt-4 flex flex-1 flex-col gap-0.5">
                    {NAV.map(({ href, label, icon: Icon }) => {
                        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                                    active
                                        ? 'bg-surface-2 text-fg'
                                        : 'text-muted hover:bg-surface-2/60 hover:text-fg',
                                )}
                            >
                                <Icon
                                    width={18}
                                    height={18}
                                    className={active ? 'text-accent' : 'text-faint'}
                                />
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="rounded-lg border border-line-soft bg-surface p-3">
                    <p className="text-faint text-xs">Signed in as</p>
                    <p className="mt-0.5 font-mono text-fg text-xs">{short(session.merchant, 5)}</p>
                    <button
                        type="button"
                        onClick={signOut}
                        className="-mx-1 mt-2 inline-flex items-center gap-1.5 rounded-md px-1 py-1.5 text-faint text-xs transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                        <LogOutIcon width={14} height={14} />
                        Sign out
                    </button>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-line border-b bg-canvas/80 px-5 py-3 backdrop-blur md:px-8">
                    <span className="font-semibold text-fg text-sm md:hidden">kairos</span>
                    <div className="ml-auto flex items-center gap-3">
                        {/* Cluster indicator: amber for devnet so it's unmistakable (never mainnet). */}
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning-soft px-2 py-1 text-warning text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                            devnet
                        </span>
                        <span className="hidden font-mono text-muted text-xs sm:inline">
                            {short(session.merchant, 4)}
                        </span>
                    </div>
                </header>

                <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 md:px-8">{children}</main>
            </div>
        </div>
    );
}
