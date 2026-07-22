/**
 * Site-wide constants used for metadata, SEO and structured data.
 * Pure data, no framework imports, so it stays portable.
 */

/** Which cluster this deployment talks about. Drives the status badges. */
export type Network = 'devnet' | 'mainnet';

const network: Network = process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'mainnet' : 'devnet';

export const site = {
    name: 'kairos',
    tagline: 'Recurring payments on Solana',
    description:
        'kairos is the open-source billing layer for native Solana subscriptions. Capped and revocable for payers, automatic and observable for merchants.',
    // Placeholder domain. Replace before going live.
    url: 'https://kairos.example',
    ogImageAlt: 'kairos: the open-source billing layer for Solana subscriptions.',
    twitter: '@kairos',

    repoUrl: 'https://github.com/erdxcc/kairros',
    docsUrl: 'https://github.com/erdxcc/kairros/tree/main/docs',
    // The merchant dashboard is a separate app in this monorepo (apps/web), so it
    // gets its own deployment. Point this at that origin; the default is the port
    // `pnpm web:dev` serves locally.
    dashboardUrl: process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3000',

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
