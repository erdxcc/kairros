import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * Where "Become a merchant" on the landing site lands.
 *
 * Merchant applications are not built yet. Until they are, this says so plainly
 * instead of 404ing, which is what the link did before, and instead of sending
 * people to /merchant, where a wallet that owns no plan gets a 403 card that
 * reads like a fault rather than an answer.
 *
 * It deliberately sits outside the (merchant) route group. That group's layout
 * wraps everything in AppShell, which swaps its children for a connect-wallet
 * prompt when there is no session, so a visitor arriving cold from the landing
 * page would be asked to sign in just to read a sentence saying "not yet".
 */
export const metadata: Metadata = {
    title: 'Merchant applications | kairos',
    description: 'Merchant applications on kairos are still in development.',
    robots: { index: false, follow: true },
};

export default function MerchantApplyPage() {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 py-16 text-center">
            <span className="rounded-full border border-warning/20 bg-warning-soft px-3 py-1 font-mono text-warning text-xs tracking-wider">
                in development
            </span>

            <h1 className="mt-5 max-w-lg text-balance font-semibold text-2xl text-fg tracking-tight">
                Merchant applications are on the way
            </h1>
            <p className="mt-3 max-w-md text-muted text-sm leading-relaxed">
                This part of kairos is still being built. Hang tight, it is coming shortly.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                <Link
                    href="/"
                    className="inline-flex h-9 items-center rounded-lg bg-accent px-4 font-medium text-canvas text-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                    Go to the dashboard
                </Link>
                <a
                    href="https://github.com/erdxcc/kairros/tree/main/docs"
                    className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 font-medium text-fg text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                    Read the docs
                </a>
            </div>

            <p className="mt-10 max-w-md text-faint text-xs leading-relaxed">
                Already running a plan on-chain? You do not need to apply. Add the kairos puller key to your
                plan&rsquo;s <code className="text-muted">pullers</code>, then sign in with the wallet that
                owns it and the merchant dashboard opens up.
            </p>
        </main>
    );
}
