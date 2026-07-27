/**
 * Site-wide constants used for metadata, SEO and structured data.
 * Pure data, no framework imports, so it stays portable.
 */

/** Which cluster this deployment talks about. Drives the status badges. */
export type Network = 'devnet' | 'mainnet';

/**
 * Resolves the cluster this deployment is about.
 *
 * `mainnet-beta` is accepted alongside `mainnet` because that is what the other
 * two apps call it (SOLANA_CLUSTER and NEXT_PUBLIC_SOLANA_CLUSTER both take
 * `mainnet-beta`), and setting the same value here used to fall through to
 * devnet. Anything unrecognised now stops a production build rather than
 * quietly picking devnet: the value shows up in the network badges and, worse,
 * inside the copy-pasteable integration snippet, so being wrong here hands
 * visitors code pointed at the wrong chain while the site itself looks fine.
 */
function resolveNetwork(value: string | undefined): Network {
    if (value === 'mainnet' || value === 'mainnet-beta') return 'mainnet';
    if (value === 'devnet') return 'devnet';
    if (process.env.NODE_ENV === 'production') {
        throw new Error(
            `NEXT_PUBLIC_NETWORK must be mainnet, mainnet-beta or devnet for a production build of the landing site (got ${value ?? 'nothing'})`,
        );
    }
    return 'devnet';
}

// Next inlines NEXT_PUBLIC_* by matching the literal `process.env.NAME` text,
// so it has to be read here rather than through a computed lookup.
const network: Network = resolveNetwork(process.env.NEXT_PUBLIC_NETWORK);

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
