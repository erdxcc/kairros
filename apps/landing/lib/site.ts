/**
 * Site-wide constants used for metadata, SEO and structured data.
 * Pure data, no framework imports, so it stays portable.
 */
export const site = {
  name: "Kairos",
  tagline: "Recurring payments on Solana",
  description:
    "Kairos is the billing layer for Solana. People manage their subscriptions and spending limits, businesses get paid on schedule, and developers ship it all with a drop-in SDK. Non-custodial, settled in seconds.",
  // Placeholder domain. Replace before going live.
  url: "https://kairos.example",
  ogImageAlt: "Kairos: subscriptions and allowances, settled on-chain.",
  twitter: "@kairos",

  repoUrl: "https://github.com/erdxcc/kairros",
  docsUrl: "https://github.com/erdxcc/kairros/tree/main/docs",
  // The merchant dashboard is a separate app in this monorepo (apps/web), so it
  // gets its own deployment. Point this at that origin; the default is the port
  // `pnpm web:dev` serves locally.
  dashboardUrl:
    process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000",
  keywords: [
    "Solana",
    "billing",
    "subscriptions",
    "allowances",
    "recurring payments",
    "non-custodial",
    "SDK",
    "web3 payments",
  ],
} as const;

export type Site = typeof site;
