/**
 * Centralised UI copy for the kairos landing page.
 *
 * All user-facing text lives here (English) so any section can be lifted into
 * another project with its strings intact. Off-site links come from lib/site.ts,
 * so the dashboard origin and repo URL are set in exactly one place.
 *
 * Voice: concise, active, specific. Fewer words, bigger statements.
 */
import { site } from '@/lib/site';

/** Where a merchant starts: the application, not the payer's dashboard. */
const merchantUrl = `${site.dashboardUrl}/merchant/apply`;

export const nav = {
    links: [
        { label: 'Why kairos', href: '#audiences' },
        { label: 'How it works', href: '#how' },
        { label: 'Features', href: '#features' },
        { label: 'Dashboard', href: '#product' },
        { label: 'Security', href: '#security' },
    ],
    signIn: { label: 'Sign in', href: site.dashboardUrl },
    start: { label: 'Start', href: site.dashboardUrl },
} as const;

export const hero = {
    eyebrow: 'Recurring payments on Solana',
    title: 'Subscriptions that settle on-chain.',
    subhead: 'Capped and revocable for payers. Automatic and observable for merchants.',
    primary: { label: 'Start', href: site.dashboardUrl },
    secondary: { label: 'View on GitHub', href: site.repoUrl },
    install: 'npm i @kairos/sdk',
    scroll: 'Scroll',
} as const;

export const ecosystem = {
    eyebrow: 'Built on the native Solana primitive',
    // Text wordmarks are deliberate: these stay placeholders until we have
    // permission to use real logos.
    marks: [
        { label: 'Solana', mono: false },
        { label: '@solana/subscriptions', mono: true },
        { label: '@solana/kit', mono: true },
        { label: 'Phantom', mono: false },
        { label: 'Solflare', mono: false },
        { label: 'Helius', mono: false },
    ],
} as const;

export const audiences = {
    eyebrow: 'One rail, two sides',
    heading: 'Recurring payments that work for everyone involved.',
    lead: 'Capped and revocable for payers. Automatic and observable for merchants.',
    cards: [
        {
            tag: '01 / For customers',
            tone: 'accent' as const,
            title: 'Spend on your terms',
            body: 'Approve a capped allowance in your wallet. Cancel anytime, funds stay yours until a charge is due.',
            points: [
                'A hard spending cap that you set',
                'Cancel or pause straight from your wallet',
                'Payout destinations locked on-chain, no surprises',
            ],
            cta: { label: 'Open your dashboard', href: site.dashboardUrl },
        },
        {
            tag: '02 / For merchants',
            tone: 'success' as const,
            title: 'Get paid on schedule',
            body: 'Set a plan. kairos handles the charges, webhooks, and the dashboard.',
            points: [
                'Plans, pricing, and recurring delegations',
                'Automatic billing pulled on the due date',
                'MRR, churn, and HMAC-signed webhooks',
            ],
            cta: { label: 'Become a merchant', href: merchantUrl },
        },
    ],
} as const;

export const howItWorks = {
    eyebrow: 'How it works',
    heading: 'From plan to payout, on autopilot.',
    steps: [
        {
            title: 'Create a plan',
            body: 'Price, interval, and a payout destination locked on-chain.',
        },
        {
            title: 'Customer subscribes',
            body: 'They approve a recurring allowance in their wallet. Revocable anytime.',
        },
        {
            title: 'kairos charges on time',
            body: 'A scheduler pulls each due payment through the puller key, which cannot redirect funds.',
        },
        {
            title: 'You get paid, events fire',
            body: 'Payouts settle, signed webhooks fire, the dashboard updates.',
        },
    ],
} as const;

export type FeatureGlyph = 'grid' | 'cycle' | 'bars' | 'retry' | 'button' | 'send';

export const features = {
    eyebrow: 'The product layer',
    heading: 'Everything the on-chain program leaves out.',
    lead: 'The Solana Subscriptions program is the engine. kairos is the dashboard, scheduler, and webhooks around it.',
    live: [
        {
            glyph: 'grid' as FeatureGlyph,
            title: 'Merchant dashboard',
            body: 'Subscribers, MRR, churn, and payment history.',
        },
        {
            glyph: 'cycle' as FeatureGlyph,
            title: 'Automatic billing',
            body: 'A scheduler pulls every due payment. No manual runs.',
        },
        {
            glyph: 'bars' as FeatureGlyph,
            title: 'HMAC webhooks',
            body: 'Signed events your backend can trust.',
        },
    ],
    planned: [
        {
            glyph: 'retry' as FeatureGlyph,
            title: 'Dunning',
            body: 'Retries, grace periods, and statuses for failed charges.',
        },
        {
            glyph: 'button' as FeatureGlyph,
            title: 'Subscribe with Solana',
            body: 'Hosted checkout and an embeddable button.',
        },
        {
            glyph: 'send' as FeatureGlyph,
            title: 'Telegram alerts',
            body: 'Alerts for upcoming and failed charges.',
        },
    ],
    soonLabel: 'Soon',
} as const;

export const dashboard = {
    eyebrow: 'The dashboard',
    heading: 'Your revenue, the way a billing product should show it.',
    lead: 'Live MRR, subscribers, churn, and payments, from real on-chain events.',
    url: 'app.kairos.dev/overview',
    sidebar: ['Overview', 'Plans', 'Subscribers', 'Payments', 'Settings'],
    pullerKey: { label: 'Puller key', value: '7Yk4…Q9fA' },
    stats: [
        { label: 'MRR', value: '4,208', suffix: '.50', delta: '↑ 12.4%', note: 'USDC / mo' },
        { label: 'Active subscribers', value: '1,204', suffix: '', delta: '↑ 38', note: 'this week' },
        { label: 'Churn', value: '2.1', suffix: '%', delta: '↓ 0.4%', note: '30-day' },
    ],
    chart: {
        title: 'Revenue',
        range: 'last 30 days',
        // Illustrative revenue curve, drawn as an SVG area + line.
        data: [
            12, 15, 14, 18, 17, 21, 24, 23, 28, 31, 29, 34, 38, 36, 42, 47, 44, 50, 55, 52, 59, 64, 61, 68,
            73, 78, 82, 88, 93, 99, 106,
        ],
    },
    payments: {
        title: 'Recent payments',
        viewAll: 'View all',
        rows: [
            { address: '7xKq…3fA2', plan: 'Pro monthly', amount: '29.00', status: 'succeeded' as const },
            { address: 'B2mR…8kL1', plan: 'Team annual', amount: '290.00', status: 'succeeded' as const },
            { address: '9pQv…2wZ7', plan: 'Pro monthly', amount: '29.00', status: 'retrying' as const },
        ],
    },
} as const;

export const checkout = {
    eyebrow: 'Drop-in checkout',
    // Honestly tagged: the SDK is designed, not shipped.
    badge: 'preview',
    heading: 'Add "Subscribe with Solana" in a few lines.',
    lead: 'One SDK. Hosted or embedded, wired to your plans. No contract code.',
    points: [
        'Hosted page or fully embedded button',
        'Point it at a plan id and go',
        'Grant access from signed webhooks',
    ],
    install: 'npm i @kairos/sdk',
    tabs: [
        { id: 'checkout' as const, label: 'checkout.ts' },
        { id: 'webhook' as const, label: 'webhook.ts' },
    ],
} as const;

export type CodeTab = (typeof checkout.tabs)[number]['id'];

export const trust = {
    eyebrow: 'Trust',
    heading: 'Auditable by design.',
    items: [
        {
            title: 'Open source, MIT-licensed',
            body: 'Public and self-hostable. Read it before you route a cent through it.',
            link: { label: 'View on GitHub →', href: site.repoUrl },
        },
        {
            title: 'Built on an audited engine',
            body: 'Runs on the native Solana program, audited by Cantina and Spearbit.',
        },
        {
            title: 'Funds can never be redirected',
            body: 'kairos never custodies funds. Destinations are immutable on-chain.',
        },
    ],
    programIdLabel: 'Program id',
    programIdNote: 'mainnet & devnet',
} as const;

export const cta = {
    heading: 'Start billing on Solana today.',
    // Reads the cluster rather than naming one: this line claimed devnet on
    // every deployment, including a mainnet one, and nothing about it moved
    // when the badges did.
    lead: `Open-source, self-hostable, live on ${site.network}.`,
    primary: { label: 'Start free', href: site.dashboardUrl },
    secondary: { label: 'View on GitHub', href: site.repoUrl },
} as const;

// Footer entries without an `href` are pages that do not exist yet. They render
// as plain labels rather than links that go nowhere, and become links the moment
// there is somewhere to point them.
export const footer = {
    tagline: 'The open-source billing layer for native Solana subscriptions.',
    stage: 'MVP',
    columns: [
        {
            heading: 'Product',
            links: [
                { label: 'Dashboard', href: '#product' },
                { label: 'Features', href: '#features' },
                { label: 'Security', href: '#security' },
                { label: 'How it works', href: '#how' },
            ],
        },
        {
            heading: 'Developers',
            links: [
                { label: 'SDK', href: '#build' },
                { label: 'Webhooks', href: '#build' },
                { label: 'API reference' },
                { label: 'Docs', href: site.docsUrl },
            ],
        },
        {
            heading: 'Project',
            links: [
                { label: 'GitHub', href: site.repoUrl },
                { label: 'Roadmap', href: `${site.repoUrl}/tree/main/docs/progress` },
                { label: 'Brand', href: `${site.repoUrl}/blob/main/brand.md` },
                { label: 'License · MIT', href: `${site.repoUrl}/blob/main/LICENSE` },
            ],
        },
    ],
    copyright: '© 2026 kairos · MIT License',
    legal: [{ label: 'Status' }, { label: 'Privacy' }, { label: 'Terms' }],
} as const;
