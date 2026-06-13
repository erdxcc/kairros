/**
 * Sign-In-With-Solana message format, shared by the API (which builds and
 * verifies it) and any client (dashboard, test scripts) that signs it.
 *
 * The wallet signs the exact UTF-8 string returned by `buildSignInMessage`.
 * The server ties that string to a short-lived, server-issued nonce so a
 * captured signature cannot be replayed beyond the nonce's lifetime.
 */
export interface SignInMessageParams {
    domain: string;
    address: string;
    nonce: string;
    issuedAt: string; // ISO 8601
}

export function buildSignInMessage(params: SignInMessageParams): string {
    return [
        `${params.domain} wants you to sign in with your Solana account:`,
        params.address,
        '',
        'Sign in to the kairos merchant dashboard.',
        '',
        `Nonce: ${params.nonce}`,
        `Issued At: ${params.issuedAt}`,
    ].join('\n');
}
