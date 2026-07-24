// `.js` suffix: this config is loaded as plain ESM by Node, not bundled, and
// Next 15 only exports the suffixed path.
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
            `NEXT_PUBLIC_SOLANA_CLUSTER must be devnet or mainnet-beta for a production build of the dashboard (got ${cluster ?? 'nothing'}). ` +
                'It is inlined into the browser bundle for explorer links and the header badge, ' +
                'so a wrong value labels mainnet data "devnet". Set it in the deployment environment (see .env.example).',
        );
    }
    return nextConfig;
}
