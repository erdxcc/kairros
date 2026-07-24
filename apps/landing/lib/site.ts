/**
 * Site-wide constants used for metadata, SEO and structured data.
 * Pure data, no framework imports, so it stays portable.
 */

/** Which cluster this deployment talks about. Drives the status badges. */
export type Network = 'devnet' | 'mainnet';

const network: Network = process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';

// Next inlines NEXT_PUBLIC_* by matching the literal `process.env.NAME` text,
// so these have to be read here rather than through a computed lookup.
const dashboardOrigin = process.env.NEXT_PUBLIC_DASHBOARD_URL;
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL;

/**
 * Resolves a public origin, requiring it in production builds.
 *
 * A localhost fallback that survives into production is exactly how a live
 * "Start" button ends up pointing at a machine nobody else can reach, so a
 * missing variable fails the build instead of shipping a dead link. The dev
 * default keeps `pnpm landing:dev` working with no setup.
 */
function requiredOrigin(name: string, value: string | undefined, devFallback: string): string {
    if (value) return value.replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`${name} must be set for a production build of the landing site`);
    }
    return devFallback;
}

export const site = {
    name: 'kairos',
    tagline: 'Recurring payments on Solana',
    description:
        'kairos is the open-source billing layer for native Solana subscriptions. Capped and revocable for payers, automatic and observable for merchants.',
    // Canonical origin: drives metadataBase, the sitemap, robots and OG tags.
    url: requiredOrigin('NEXT_PUBLIC_SITE_URL', siteOrigin, 'http://localhost:3001'),
    ogImageAlt: 'kairos: the open-source billing layer for Solana subscriptions.',
    twitter: '@kairos',

    repoUrl: 'https://github.com/erdxcc/kairros',
    docsUrl: 'https://github.com/erdxcc/kairros/tree/main/docs',
    // The dashboard is a separate app in this monorepo (apps/web) with its own
    // deployment. Point this at that origin.
    dashboardUrl: requiredOrigin('NEXT_PUBLIC_DASHBOARD_URL', dashboardOrigin, 'http://localhost:3000'),

    network,
    // The native Solana Subscriptions program kairos bills through. Same address
    // on both clusters.
    programId: 'De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44',

    // Planned work shows up as dimmed "soon" cards rather than being hidden, so
    // the roadmap stays honest. Flip off to ship only what is live today.
    showPlanned: true,

    keywords: [
        'Solana',
        'billing',
        'subscriptions',
        'allowances',
        'recurring payments',
        'non-custodial',
        'SDK',
        'web3 payments',
    ],
} as const;

export type Site = typeof site;
