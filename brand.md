# Brand — kairos

_Status: active_

kairos is an open-source merchant billing layer for the native Solana
Subscriptions program — "Stripe Billing for Solana." The product surface (the
merchant dashboard) should feel like a serious, trustworthy fintech tool, in the
lineage of Stripe and Linear: calm, dark, dense-but-legible, never flashy.

The tokens below live in [`apps/web/app/globals.css`](apps/web/app/globals.css)
(Tailwind v4 `@theme`) and are the source of truth. Use the Tailwind utilities
(`bg-surface`, `text-muted`, `border-line`, `text-accent`, …), never raw hex.

## Palette (dark, default)

| Token | Hex | Use |
| --- | --- | --- |
| `canvas` | `#0a0a0e` | App background |
| `surface` | `#131318` | Cards, panels |
| `surface-2` | `#1a1a21` | Raised controls, hover fills, skeletons |
| `line` | `#26262f` | Borders |
| `line-soft` | `#1d1d24` | Internal dividers |
| `fg` | `#ededf1` | Primary text |
| `muted` | `#9b9baa` | Secondary text (AA on canvas) |
| `faint` | `#82828f` | Captions, labels, decorative icons (AA on canvas) |
| `accent` | `#7c6cff` | Primary action, focus rings, links, charts |
| `success` | `#3ecf8e` | Active / succeeded |
| `warning` | `#f0b15a` | Cancelled / sunset / **devnet** indicator |
| `danger` | `#f0635a` | Failed / destructive |

Each semantic color has a `-soft` companion for low-emphasis badge fills.

## Typography

- **Sans** (`--font-sans`): system UI stack. All prose and labels.
- **Mono** (`--font-mono`): addresses, signatures, and money/numeric values that
  change — always paired with `tabular-nums` so digits don't jitter.
- Scale leans small and tight: `text-xl` page titles, `text-sm` body, `text-xs`
  for labels/metadata. `tracking-tight` on headings.

## Voice

- Concise, active, specific. "No subscribers yet" not "There is currently no data."
- Explain on-chain mechanics plainly where trust matters (e.g. the puller key
  "can never redirect funds — destinations are immutable on-chain").
- A user's wallet rejection is a state, not an error — never scold.

## Motion

Discipline over decoration. Micro feedback ≤100ms (`transition-colors`), element
enters 150–250ms `ease-out`. Specify properties, never `transition: all`. All
motion is disabled under `prefers-reduced-motion: reduce`.

---

To re-pick this palette/typography from scratch, run `/brand-design`.
