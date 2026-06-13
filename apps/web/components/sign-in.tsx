'use client';

import { useAuth } from '@/lib/auth-client';
import { type DetectedWallet, listWallets, onWalletsChange } from '@/lib/wallet';
import { useEffect, useState } from 'react';
import { Logo, WalletIcon } from './icons';
import { Card, Spinner } from './ui';

export function SignIn() {
    const { signIn } = useAuth();
    const [wallets, setWallets] = useState<DetectedWallet[]>([]);
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Wallets register asynchronously; refresh the list as they announce.
    useEffect(() => {
        setWallets(listWallets());
        return onWalletsChange(() => setWallets(listWallets()));
    }, []);

    async function handle(detected: DetectedWallet) {
        setError(null);
        setPending(detected.name);
        try {
            await signIn(detected);
        } catch (err) {
            // Wallet rejections surface as errors; show a friendly message.
            const message = err instanceof Error ? err.message : 'Sign-in failed';
            setError(/reject|denied|cancel/i.test(message) ? 'Sign-in was cancelled.' : message);
        } finally {
            setPending(null);
        }
    }

    return (
        <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface text-accent">
                        <Logo width={26} height={26} />
                    </div>
                    <h1 className="mt-4 font-semibold text-fg text-lg tracking-tight">kairos</h1>
                    <p className="mt-1 text-muted text-sm">
                        Sign in with your Solana wallet to open the merchant dashboard.
                    </p>
                </div>

                <Card className="p-2">
                    {wallets.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                            <WalletIcon className="text-faint" />
                            <p className="font-medium text-fg text-sm">No wallet detected</p>
                            <p className="max-w-[15rem] text-faint text-xs">
                                Install a Solana wallet such as Phantom or Solflare, then reload this page.
                            </p>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {wallets.map((w) => (
                                <li key={w.name}>
                                    <button
                                        type="button"
                                        disabled={pending !== null}
                                        onClick={() => handle(w)}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {w.icon ? (
                                            <img
                                                src={w.icon}
                                                alt=""
                                                width={24}
                                                height={24}
                                                className="rounded"
                                            />
                                        ) : (
                                            <WalletIcon className="text-muted" />
                                        )}
                                        <span className="flex-1 font-medium text-fg text-sm">{w.name}</span>
                                        {pending === w.name ? <Spinner className="text-accent" /> : null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                {error ? <p className="mt-3 text-center text-danger text-xs">{error}</p> : null}

                <p className="mt-6 text-center text-faint text-xs">
                    You sign a one-time message to prove wallet ownership. No transaction, no gas.
                </p>
            </div>
        </main>
    );
}
