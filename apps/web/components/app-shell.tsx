'use client';

import { useAuth } from '@/lib/auth-client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import {
    Logo,
    OverviewIcon,
    PaymentsIcon,
    PlansIcon,
    SettingsIcon,
    SubscribersIcon,
    WalletIcon,
} from './icons';
import { Spinner, cn } from './ui';
import { WalletMenu } from './wallet-menu';

const NAV = [
    { href: '/', label: 'Overview', icon: OverviewIcon },
    { href: '/plans', label: 'Plans', icon: PlansIcon },
    { href: '/subscribers', label: 'Subscribers', icon: SubscribersIcon },
    { href: '/payments', label: 'Payments', icon: PaymentsIcon },
    { href: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    // Session hydrates in an effect; hold a neutral splash until then so the
    // header doesn't flash between connected/disconnected on refresh.
    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-canvas text-faint">
                <Spinner />
            </div>
        );
    }

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
                        <WalletMenu />
                    </div>
                </header>

                <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 md:px-8">
                    {session ? children : <ConnectPrompt />}
                </main>
            </div>
        </div>
    );
}

// Shown in place of the data pages when no wallet is connected: the dashboard
// chrome stays visible, and connecting is a top-right action (or this button).
function ConnectPrompt() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface text-accent">
                <WalletIcon width={24} height={24} />
            </div>
            <h1 className="mt-4 font-semibold text-fg text-lg tracking-tight">Connect your wallet</h1>
            <p className="mt-1 max-w-sm text-muted text-sm">
                Sign in with your Solana wallet to load your merchant data. One signature, no transaction, no
                gas.
            </p>
            <div className="mt-5">
                <WalletMenu />
            </div>
        </div>
    );
}
