'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, createElement, useContext, useEffect, useState } from 'react';
import { requestNonce, verifySignature } from './api';
import { SESSION_EVENT, type Session, clearSession, readSession, writeSession } from './session';
import { type DetectedWallet, connect, signMessage } from './wallet';

interface AuthContextValue {
    session: Session | null;
    /** Run the full SIWS handshake with the chosen wallet. */
    signIn: (wallet: DetectedWallet) => Promise<void>;
    signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const qc = useQueryClient();

    // Hydrate from storage on mount and stay in sync with cross-cutting clears
    // (e.g. a 401 in apiFetch dispatches SESSION_EVENT).
    useEffect(() => {
        setSession(readSession());
        const sync = () => setSession(readSession());
        window.addEventListener(SESSION_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(SESSION_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    async function signIn(detected: DetectedWallet): Promise<void> {
        const account = await connect(detected.wallet);
        const address = account.address;
        const { message, nonceToken } = await requestNonce(address);
        const signature = await signMessage(detected.wallet, account, message);
        const { token, merchant } = await verifySignature({ address, message, signature, nonceToken });
        const next = { token, merchant };
        writeSession(next);
        setSession(next);
    }

    function signOut(): void {
        clearSession();
        setSession(null);
        qc.clear();
    }

    return createElement(AuthContext.Provider, { value: { session, signIn, signOut } }, children);
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
