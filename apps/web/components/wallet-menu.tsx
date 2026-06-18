'use client';

import { useAuth } from '@/lib/auth-client';
import { short } from '@/lib/format';
import { type DetectedWallet, listWallets, onWalletsChange } from '@/lib/wallet';
import { useEffect, useRef, useState } from 'react';
import { LogOutIcon, WalletIcon } from './icons';
import { Spinner } from './ui';

/**
 * Wallet sign-in as a top-right account control (replaces the full-screen gate).
 * Signed out → a "Connect wallet" button that drops down the detected wallets;
 * signed in → the merchant address with a sign-out menu. Reuses the same SIWS
 * handshake (lib/auth-client `signIn`) — no auth logic changes here.
 */
export function WalletMenu() {
    const { session, signIn, signOut } = useAuth();
    const [wallets, setWallets] = useState<DetectedWallet[]>([]);
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    // Wallets register asynchronously; refresh as they announce.
    useEffect(() => {
        setWallets(listWallets());
        return onWalletsChange(() => setWallets(listWallets()));
    }, []);

    // Dismiss on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        function onPointer(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        window.addEventListener('mousedown', onPointer);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onPointer);
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    async function handle(detected: DetectedWallet) {
        setError(null);
        setPending(detected.name);
        try {
            await signIn(detected);
            setOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Sign-in failed';
            // Declining the signature is a choice, not an error.
            if (!/reject|denied|cancel|user/i.test(message)) setError(message);
        } finally {
            setPending(null);
        }
    }

    const panel =
        'absolute right-0 z-20 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-black/40 shadow-xl';

    if (session) {
        return (
            <div className="relative" ref={ref}>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    <span className="font-mono text-fg text-xs">{short(session.merchant, 4)}</span>
                </button>
                {open && (
                    <div className={panel}>
                        <p className="px-2 pt-1 text-faint text-xs">Signed in as</p>
                        <p className="px-2 pb-2 font-mono text-fg text-xs">
                            {short(session.merchant, 6)}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                signOut();
                                setOpen(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-faint text-sm transition-colors hover:bg-surface-2 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                        >
                            <LogOutIcon width={15} height={15} />
                            Sign out
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 font-medium text-sm text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
                <WalletIcon width={16} height={16} />
                Connect wallet
            </button>
            {open && (
                <div className={panel}>
                    {wallets.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                            <WalletIcon className="text-faint" />
                            <p className="font-medium text-fg text-sm">No wallet detected</p>
                            <p className="text-faint text-xs">Install a Solana wallet, then reload.</p>
                            <div className="mt-1 flex gap-4 font-medium text-xs">
                                <a
                                    href="https://phantom.app/download"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                >
                                    Get Phantom
                                </a>
                                <a
                                    href="https://solflare.com/download"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                                >
                                    Get Solflare
                                </a>
                            </div>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-0.5">
                            {wallets.map((w) => (
                                <li key={w.name}>
                                    <button
                                        type="button"
                                        disabled={pending !== null}
                                        aria-busy={pending === w.name}
                                        onClick={() => handle(w)}
                                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {w.icon ? (
                                            <img src={w.icon} alt="" width={20} height={20} className="rounded" />
                                        ) : (
                                            <WalletIcon className="text-muted" width={20} height={20} />
                                        )}
                                        <span className="flex-1 font-medium text-fg text-sm">{w.name}</span>
                                        {pending === w.name && <Spinner className="text-accent" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {error && <p className="px-2 pt-2 text-center text-danger text-xs">{error}</p>}
                </div>
            )}
        </div>
    );
}
