# Kairos — Landing

A production-grade, single-page marketing site for **Kairos**, the billing layer
for Solana ("Stripe for Solana"). Dark, minimal, with one signature moment: a
full WebGL fluid ("silk") background behind the hero. Built clean-room — all
code, shaders, copy, and assets are original.

The page speaks to all three audiences at once: **people** (approve a capped,
revocable spending limit), **businesses** (get paid on schedule, instant
settlement), and **developers** (a drop-in SDK).

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit (strict)
```

Requirements: Node 18.18+ (developed on Node 20).

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** — CSS-first config via `@theme` in `app/globals.css`
- **OGL** — minimal WebGL library powering the fluid simulation
- **Geist Sans / Geist Mono** via `next/font` (the `geist` package)
- Everything else uses native APIs: `IntersectionObserver`, the Web Animations
  API, `requestAnimationFrame`. No GSAP, Framer Motion, or smooth-scroll libs.

There is no backend, database, or auth. All CTAs are placeholders (`href="#"`).

## Project structure

```
app/
  layout.tsx            fonts, metadata, grain overlay
  page.tsx              section composition
  globals.css           Tailwind v4 entry + @theme tokens + keyframes
  opengraph-image.tsx   generated OG image (next/og)
  icon.tsx              generated favicon
  robots.ts, sitemap.ts SEO
components/
  sections/             Nav, Hero, AudienceTabs, EcosystemRow, FeatureGrid,
                        DeveloperCode, HowItWorks, TrustBand, CtaBand, Footer
  effects/              SilkBackground, Marquee, Reveal, CodeBlock, GrainOverlay
  ui/                   Button, Card, Tabs, Logo, Icon
lib/
  silk/                 framework-agnostic fluid sim (SilkField, shaders,
                        palette, types) — OGL only, no Next/React imports
  copy.ts               all user-facing text in one place
  cn.ts, highlight.ts, useInView.ts, useReducedMotion.ts
```

## Porting a section or effect

Each section and effect is intentionally self-contained, so you can lift one
into another project with minimal changes:

1. **A section** (e.g. `components/sections/FeatureGrid.tsx`) — copy the file
   plus the UI primitives it imports from `components/ui/*`, the relevant slice
   of `lib/copy.ts`, and the design tokens from the `@theme` block in
   `app/globals.css`. Sections only depend on tokens + primitives, not on each
   other.
2. **The silk background** — copy the whole `lib/silk/` folder (it imports only
   `ogl`, never Next or React) and `components/effects/SilkBackground.tsx` (the
   thin `"use client"` React wrapper + fallbacks). Use it directly:

   ```tsx
   import { SilkBackground } from "@/components/effects/SilkBackground";
   <SilkBackground className="absolute inset-0 -z-10" />;
   ```

   Or use the field standalone in any framework:

   ```ts
   import { SilkField } from "@/lib/silk/SilkField";
   const field = new SilkField();
   const ok = field.mount(canvasEl); // false if WebGL2 / float RT unsupported
   ```
3. **Reveal / Marquee / CodeBlock** — each is a single file in
   `components/effects/` with at most one `lib/*` helper.

## The silk background

A full incompressible Stable-Fluids (Navier–Stokes) solver running on the GPU on
a fixed **280×280** ping-pong **RGBA16F** grid. Per frame, the passes run in
order: inject → advect + diffuse → divergence → pressure (10 Jacobi iterations)
→ projection → display. The display pass distorts a procedurally generated
gradient texture (violet → cyan → teal) by the velocity field.

It degrades gracefully to a static gradient (same palette) when any of these
hold: `prefers-reduced-motion` / `prefers-reduced-data` / Save-Data, viewport
`< 768px`, or no WebGL2 + `EXT_color_buffer_float`. The simulation pauses
offscreen (IntersectionObserver) and when the tab is hidden, and frees all GL
resources on unmount.

## Accessibility & motion

- Semantic landmarks, logical heading order, visible focus rings.
- `AudienceTabs` and the code block are full keyboard `tablist`s (arrow keys,
  roving tabindex, `aria-selected`).
- `prefers-reduced-motion` disables the fluid sim, freezes the marquee, and
  makes reveals instant.
- Text over the fluid sits on a scrim to keep contrast at WCAG AA.

## Notes

- Set the production domain in `lib/site.ts` (`url`) — it drives canonical URLs,
  Open Graph, robots, and the sitemap.
- All brand marks in the ecosystem marquee are original placeholders.
