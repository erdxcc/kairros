import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * The landing site is static marketing with a WebGL background and no session,
 * so its policy can be tighter than the dashboard's: no remote connections at
 * all. `'unsafe-inline'` on scripts is Next's inline bootstrap, as in the
 * dashboard; `'unsafe-eval'` is the dev-only refresh runtime.
 */
function contentSecurityPolicy(isDev: boolean): string {
    return [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src 'self'${isDev ? ' ws:' : ''}`,
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');
}

const nextConfig: NextConfig = {
    reactStrictMode: true,
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
        ];
    },
};

/**
 * Origins a production build cannot guess.
 *
 * `lib/site.ts` already refuses to fall back to localhost, but it throws while
 * Next collects page data, so the deploy log blames whichever page happened to
 * be collected first ("Failed to collect page data for /_not-found") and buries
 * the reason under a turbopack stack trace. Checking here stops the build
 * before it compiles anything, with the missing names on the first line.
 */
const REQUIRED_FOR_BUILD = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_DASHBOARD_URL'];

export default function config(phase: string): NextConfig {
    if (phase === PHASE_PRODUCTION_BUILD) {
        const missing = REQUIRED_FOR_BUILD.filter((name) => !process.env[name]);
        if (missing.length > 0) {
            throw new Error(
                `${missing.join(' and ')} must be set for a production build of the landing site. NEXT_PUBLIC_SITE_URL is the canonical origin used for metadata, the sitemap and OG tags; NEXT_PUBLIC_DASHBOARD_URL is where Start, Sign in and Become a merchant point. Set them in the deployment environment (see .env.example).`,
            );
        }
    }
    return nextConfig;
}
