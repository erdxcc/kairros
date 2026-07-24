import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const nextConfig: NextConfig = {
    reactStrictMode: true,
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
                `${missing.join(' and ')} must be set for a production build of the landing site. ` +
                    'NEXT_PUBLIC_SITE_URL is the canonical origin used for metadata, the sitemap and OG tags; ' +
                    'NEXT_PUBLIC_DASHBOARD_URL is where Start, Sign in and Become a merchant point. ' +
                    'Set them in the deployment environment (see .env.example).',
            );
        }
    }
    return nextConfig;
}
