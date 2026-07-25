// `.js` suffix: this config is loaded as plain ESM by Node, not bundled, and
// Next 15 only exports the suffixed path.
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

/**
 * Content-Security-Policy for the dashboard.
 *
 * `'unsafe-inline'` on scripts is Next's requirement, not a preference: the
 * App Router ships inline bootstrap and flight-payload scripts, and a static
 * config has no nonce to give them. Tightening that needs per-request nonces
 * via middleware, which is a change worth making deliberately rather than as
 * part of a headers pass. `'unsafe-eval'` is dev-only (the React refresh
 * runtime), and is not emitted in production.
 *
 * `connect-src` stays open to https because a browser wallet extension may
 * reach its own services during the sign-in handshake, and breaking sign-in is
 * a worse failure than the marginal exfiltration path this would close.
 * `frame-ancestors 'none'` is the load-bearing one here: the dashboard holds a
 * session, so it must not be frameable.
 */
function contentSecurityPolicy(isDev) {
    return [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss:",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    async headers() {
        const isDev = process.env.NODE_ENV !== 'production';
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'Content-Security-Policy', value: contentSecurityPolicy(isDev) },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), payment=()',
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                ],
            },
            {
                // Nothing under the API is cacheable: it is all per-wallet.
                source: '/api/:path*',
                headers: [{ key: 'Cache-Control', value: 'no-store' }],
            },
        ];
    },
    // @kairos/core ships raw TypeScript (exports point at ./src); let Next transpile it.
    transpilePackages: ['@kairos/core'],
    // Native/Node-only deps must not be bundled: they run on the nodejs runtime.
    serverExternalPackages: ['pg', '@electric-sql/pglite'],
    webpack: (config) => {
        // @kairos/core uses NodeNext-style `.js` import specifiers that actually
        // resolve to `.ts` source files. Teach webpack to try `.ts(x)` for `.js`.
        config.resolve.extensionAlias = {
            '.js': ['.ts', '.tsx', '.js'],
            ...config.resolve.extensionAlias,
        };
        return config;
    },
};

/**
 * The cluster is inlined into the browser bundle, so it is a build input.
 *
 * `lib/format.ts` refuses to guess it in production, but that throw surfaces as
 * a page-data collection failure with the reason buried in a bundler stack
 * trace. Failing here instead names the variable on the first line of the log.
 */
export default function config(phase) {
    const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
    if (phase === PHASE_PRODUCTION_BUILD && cluster !== 'devnet' && cluster !== 'mainnet-beta') {
        throw new Error(
            `NEXT_PUBLIC_SOLANA_CLUSTER must be devnet or mainnet-beta for a production build of the dashboard (got ${cluster ?? 'nothing'}). It is inlined into the browser bundle for explorer links and the header badge, so a wrong value labels mainnet data "devnet". Set it in the deployment environment (see .env.example).`,
        );
    }
    return nextConfig;
}
