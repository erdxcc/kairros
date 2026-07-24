'use client';

import { useMerchantStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth-client';
import { CLUSTER } from '@/lib/format';
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

// Two sections, one shell. The dashboard belongs to the payer by default: a
// wallet that subscribed to something opens the app and sees what it is paying
// for. The merchant side is the same chrome under /merchant, and the path is
// what decides which navigation is on screen.
const PAYER_NAV = [
    { href: '/', label: 'Subscriptions', icon: SubscribersIcon },
    { href: '/payments', label: 'Payments', icon: PaymentsIcon },
] as const;

const MERCHANT_NAV = [
    { href: '/merchant', label: 'Overview', icon: OverviewIcon },
    { href: '/merchant/plans', label: 'Plans', icon: PlansIcon },
    { href: '/merchant/subscribers', label: 'Subscribers', icon: SubscribersIcon },
    { href: '/merchant/payments', label: 'Payments', icon: PaymentsIcon },
    { href: '/merchant/settings', label: 'Settings', icon: SettingsIcon },
] as const;

/** Section roots ('/' and '/merchant') match exactly; the rest match by prefix. */
function isActive(href: string, pathname: string): boolean {
    if (href === '/' || href === '/merchant') return pathname === href;
    return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const inMerchant = pathname === '/merchant' || pathname.startsWith('/merchant/');
    const nav = inMerchant ? MERCHANT_NAV : PAYER_NAV;

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
                    {nav.map(({ href, label, icon: Icon }) => {
                        const active = isActive(href, pathname);
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
                        <SectionSwitch inMerchant={inMerchant} signedIn={Boolean(session)} />
                        <ClusterBadge />
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

/**
 * The way between the two sections. A merchant is also a payer, so it needs to
 * work both ways.
 *
 * It only appears for wallets that own a plan. Wallets that do not are not
 * offered a merchant application here yet, because there is nowhere to apply
 * until merchant applications exist; sending them to a dead URL would be worse
 * than saying nothing.
 */
function SectionSwitch({ inMerchant, signedIn }: { inMerchant: boolean; signedIn: boolean }) {
    const status = useMerchantStatus(signedIn);
    if (!signedIn || !status.data?.isMerchant) return null;
    return (
        <Link
            href={inMerchant ? '/' : '/merchant'}
            className="hidden items-center rounded-lg border border-line bg-surface px-3 py-1.5 font-medium text-fg text-xs transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:inline-flex"
        >
            {inMerchant ? 'My subscriptions' : 'Merchant dashboard'}
        </Link>
    );
}

// Which chain the numbers on screen came from. Amber on devnet, so test money
// is unmistakable; quiet on mainnet, where the badge is a fact, not a warning.
function ClusterBadge() {
    const devnet = CLUSTER === 'devnet';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                devnet
                    ? 'border-warning/20 bg-warning-soft text-warning'
                    : 'border-line bg-surface text-muted',
            )}
        >
            <span className={cn('h-1.5 w-1.5 rounded-full', devnet ? 'bg-warning' : 'bg-success')} />
            {devnet ? 'devnet' : 'mainnet'}
        </span>
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
                Sign in with your Solana wallet to load your subscriptions. One signature, no transaction, no
                gas.
            </p>
            <div className="mt-5">
                <WalletMenu />
            </div>
        </div>
    );
}
