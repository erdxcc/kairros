/**
 * Centralised UI copy for the Kairos landing page.
 *
 * All user-facing text lives here (English) so any section can be lifted into
 * another project with its strings intact. CTAs are placeholders (href "#").
 */

export const nav = {
  links: [
    { label: "Product", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Docs", href: "#developers" },
    { label: "Changelog", href: "#" },
  ],
  signIn: { label: "Sign in", href: "#" },
  start: { label: "Start", href: "#" },
} as const;

export const hero = {
  eyebrow: "Recurring payments on Solana",
  title: "Subscriptions and allowances, settled on-chain.",
  subhead:
    "The billing layer for Solana. People manage their subscriptions and spending limits, businesses get paid on schedule, and developers ship it all with a drop-in SDK — non-custodial, settled in seconds.",
  primary: { label: "Start", href: "#" },
  secondary: { label: "Read the docs", href: "#developers" },
  install: "npm i @kairos/sdk",
} as const;

export type AudienceId = "people" | "businesses" | "developers";

export const audiences: ReadonlyArray<{
  id: AudienceId;
  tab: string;
  title: string;
  body: string;
  cta: { label: string; href: string };
  points: readonly string[];
}> = [
  {
    id: "people",
    tab: "For people",
    title: "Approve once, stay in control.",
    body: "Set a spending limit, see every charge on-chain, cancel or revoke anytime. Your keys, your money.",
    cta: { label: "Manage subscriptions", href: "#" },
    points: [
      "Capped, revocable spending limits",
      "Every charge verifiable on-chain",
      "Cancel or revoke in one click",
    ],
  },
  {
    id: "businesses",
    tab: "For businesses",
    title: "Get paid on schedule.",
    body: "Accept recurring payments in SOL and SPL tokens with instant settlement and clean reconciliation. No custody, no chargebacks.",
    cta: { label: "Start accepting", href: "#" },
    points: [
      "Recurring charges in SOL and SPL tokens",
      "Instant settlement, clean reconciliation",
      "No custody, no chargebacks",
    ],
  },
  {
    id: "developers",
    tab: "For developers",
    title: "Ship billing in an afternoon.",
    body: "A typed, framework-agnostic SDK for subscriptions, allowances, and events on Solana.",
    cta: { label: "Read the docs", href: "#developers" },
    points: [
      "Typed, framework-agnostic SDK",
      "Subscriptions, allowances, events",
      "Webhooks and on-chain proofs",
    ],
  },
];

export const audienceSection = {
  heading: "Built for everyone in the loop.",
  subheading:
    "One layer, three jobs: people stay in control, businesses get paid, developers ship fast.",
} as const;

export const ecosystem = {
  caption: "Built on Solana. Works with the wallets and tokens you already use.",
  // Original placeholder marks (abstract names, not real brands).
  marks: [
    "Helio",
    "Solpay",
    "Orbiton",
    "Driftwood",
    "Pendari",
    "Nova Rail",
    "Quorum",
    "Lumen",
  ],
} as const;

export const features = {
  heading: "One layer for every side of the payment.",
  subheading:
    "Subscriptions and allowances are a cause and effect: people approve a capped, revocable limit, and Kairos collects within it — settled on Solana.",
  items: [
    {
      icon: "repeat" as const,
      title: "Recurring payments, native to Solana",
      body: "Scheduled pull payments built on token delegation — the primitive Solana was missing.",
    },
    {
      icon: "shield" as const,
      title: "Allowances you control",
      body: "Capped, delegated spend with a clear limit. Revoke instantly, on-chain, anytime.",
    },
    {
      icon: "bolt" as const,
      title: "Instant, verifiable settlement",
      body: "Funds move on Solana in seconds, and every charge is auditable on-chain.",
    },
    {
      icon: "code" as const,
      title: "Drop-in SDK",
      body: "Typed and framework-agnostic. Subscriptions, allowances, and events in a few lines.",
    },
  ],
} as const;

export const developer = {
  eyebrow: "For developers",
  heading: "Go live in an afternoon.",
  body: "A typed, framework-agnostic SDK wraps subscriptions, allowances, and events behind a few calls. No webhooks server to babysit, no custody to manage.",
  bullets: [
    "Create subscriptions and set allowances in a few lines",
    "Subscribe to settlement and revocation events",
    "Works in any TypeScript runtime",
  ],
  cta: { label: "Read the docs", href: "#" },
} as const;

export const howItWorks = {
  heading: "How it works",
  subheading: "From approval to reconciliation — four steps, fully non-custodial.",
  steps: [
    {
      title: "Approve an allowance",
      body: "The payer approves a capped, revocable spending limit — a delegated authority, not a transfer.",
    },
    {
      title: "Kairos collects on schedule",
      body: "Charges run on time and strictly within the approved limit. No custody at any point.",
    },
    {
      title: "Settles on Solana in seconds",
      body: "Funds move on-chain and settle in seconds — verifiable, with no chargebacks.",
    },
    {
      title: "Track & reconcile",
      body: "Dashboards and events keep everything reconciled, with an SDK for developers.",
    },
  ],
} as const;

export const trust = {
  items: [
    { label: "Non-custodial by design", detail: "Funds never touch Kairos." },
    { label: "You stay in control", detail: "Revoke any allowance, anytime." },
    { label: "~400ms settlement", detail: "On-chain, in seconds." },
    { label: "Open SDK", detail: "Typed and framework-agnostic." },
  ],
} as const;

export const cta = {
  heading: "Start building on Solana today.",
  subheading:
    "Recurring payments, allowances, and instant settlement — for people, businesses, and developers.",
  actions: [
    { label: "Start", href: "#", variant: "solid" as const },
    { label: "Read the docs", href: "#developers", variant: "ghost" as const },
  ],
  links: [
    { label: "Docs", href: "#" },
    { label: "Community", href: "#" },
    { label: "X", href: "#" },
  ],
} as const;

export const footer = {
  columns: [
    {
      heading: "Personal",
      links: ["Manage subscriptions", "Spending limits", "Activity", "Wallets"],
    },
    {
      heading: "Business",
      links: ["Accept payments", "Reconciliation", "Pricing", "Status"],
    },
    {
      heading: "Developers",
      links: ["Docs", "SDK reference", "Examples", "Changelog"],
    },
    {
      heading: "Company",
      links: ["About", "Blog", "Careers", "Brand"],
    },
    {
      heading: "Legal",
      links: ["Privacy", "Terms", "Security", "Cookies"],
    },
  ],
  copyright: "© 2026 Kairos. All rights reserved.",
  legal: [
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
  ],
} as const;
