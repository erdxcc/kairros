# The landing site

kairos got a public face. `apps/landing` is a single-page marketing site that
explains the product to the three audiences it actually has: people who want a
capped, revocable spending limit, businesses that want to get paid on schedule,
and developers who want a drop-in SDK. It was built in its own repository and
folded into this monorepo once it stood on its own.

## What shipped

**The page.** Nav, hero, audience tabs, an ecosystem row, a feature grid, a
developer code sample, a how-it-works walkthrough, a trust band, a closing CTA,
and a footer. Every string lives in `lib/copy.ts` rather than being scattered
through components, so the copy can be rewritten without touching layout.

**One signature moment: the silk background.** A full incompressible
Stable-Fluids (Navier-Stokes) solver running on the GPU over a fixed 280x280
ping-pong RGBA16F grid. Each frame runs inject, advect and diffuse, divergence,
pressure (10 Jacobi iterations), projection, and display. The display pass
distorts a procedurally generated violet to cyan to teal gradient by the
velocity field.

It degrades to a static gradient in the same palette whenever any of these hold:
`prefers-reduced-motion`, `prefers-reduced-data` or Save-Data, a viewport under
768px, or no WebGL2 with `EXT_color_buffer_float`. The simulation pauses when
offscreen and when the tab is hidden, and it frees every GL resource on unmount.

**Accessibility and motion.** Semantic landmarks, logical heading order, visible
focus rings. The audience tabs and the code block are real keyboard `tablist`s
with arrow keys, roving tabindex, and `aria-selected`. `prefers-reduced-motion`
disables the fluid sim, freezes the marquee, and makes reveals instant. Text
over the fluid sits on a scrim so contrast stays at WCAG AA.

## Deliberately kept portable

The fluid simulation in `lib/silk/` imports only `ogl`, never Next or React, so
it can be lifted into any framework:

```ts
import { SilkField } from "@/lib/silk/SilkField";
const field = new SilkField();
const ok = field.mount(canvasEl); // false if WebGL2 or float RT is unsupported
```

Sections depend on design tokens and UI primitives, never on each other, so one
can be copied out with its slice of `lib/copy.ts` and the `@theme` block from
`app/globals.css`.

## Notes

Everything here is original work: code, shaders, copy, and assets. The brand
marks in the ecosystem marquee are placeholders. The production domain is set in
`lib/site.ts`, and it drives canonical URLs, Open Graph, robots, and the sitemap.
