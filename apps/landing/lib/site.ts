/**
 * Site-wide constants used for metadata, SEO and structured data.
 * Pure data — no framework imports — so it stays portable.
 */
export const site = {
  name: "Kairos",
  tagline: "Recurring payments on Solana",
  description:
    "Kairos is the billing layer for Solana. People manage their subscriptions and spending limits, businesses get paid on schedule, and developers ship it all with a drop-in SDK — non-custodial, settled in seconds.",
  // Placeholder domain — replace before going live.
  url: "https://kairos.example",
  ogImageAlt: "Kairos — subscriptions and allowances, settled on-chain.",
  twitter: "@kairos",
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
