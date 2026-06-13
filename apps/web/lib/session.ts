/**
 * Merchant session storage (browser). The session is a JWT issued by
 * /api/v1/auth/verify after a Sign-In-With-Solana handshake. It lives in
 * localStorage so a refresh keeps the merchant signed in; a custom window
 * event lets the auth context react when any code path clears it (e.g. a 401).
 */
export interface Session {
    token: string;
    merchant: string;
}

const KEY = 'kairos.session';
export const SESSION_EVENT = 'kairos:session';

export function readSession(): Session | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Session;
        return parsed.token && parsed.merchant ? parsed : null;
    } catch {
        return null;
    }
}

export function writeSession(session: Session): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, JSON.stringify(session));
    window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(SESSION_EVENT));
}
