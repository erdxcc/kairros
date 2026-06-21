/**
 * Base texture (tMap) generation.
 *
 * The original reference fed a raster art asset into the fluid; we have no such
 * asset, so we generate our own structural texture on a 2D canvas (one time) in
 * the brand palette and hand it to OGL as a Texture. This is the "image" the
 * fluid liquefies — NOT page content.
 *
 * The distortion in the DISPLAY shader samples tMap at offset UVs driven by the
 * velocity field: it only becomes visible where neighbouring pixels DIFFER. A
 * flat gradient has almost no local contrast, so the flow reads as nothing. We
 * therefore build a marbled, sheened field — dark overall, but with strong
 * internal light/shadow contrast — so the same velocity field produces visible
 * silk folds.
 *
 * Layers (drawn back-to-front with blend modes):
 *   1. Multi-directional dark base (two crossed palette gradients).
 *   2. Marble "clouds": seeded radial blobs, some lighter, some darker.
 *   3. Diagonal sheen stripes: the signature silk highlight.
 *   4. Low-frequency soft noise: kills banding, adds organic variation.
 *   5. Edge vignette: keeps the borders calm for CLAMP_TO_EDGE sampling.
 */

export const DEFAULT_PALETTE = ["#8b5cf6", "#22d3ee", "#14f195"] as const;

// --- Canvas -----------------------------------------------------------------
// Wide so the texture covers a landscape hero without obvious stretching.
// OGL already samples this with LINEAR + CLAMP_TO_EDGE.
const TEXTURE_WIDTH = 1280;
const TEXTURE_HEIGHT = 720;

// Fixed seed → identical texture on every (re)mount, so it never flickers.
const SEED = 0x9e3779b9;

// Deep base the whole field sits on (matches the shader's dark overlay tint).
const BASE_RGB = { r: 7, g: 7, b: 11 };

// --- Tunables (the knobs to turn) -------------------------------------------
// Marble clouds.
const BLOB_COUNT = 7; //             number of radial blobs (fewer = calmer)
const BLOB_MIN_RADIUS = 0.2; //     min blob radius as a fraction of width
const BLOB_MAX_RADIUS = 0.52; //    max blob radius (larger = soft pool, not bubble)
const BLOB_BRIGHTNESS_MIN = 0.06; // min blob opacity (0..1) — overall contrast
const BLOB_BRIGHTNESS_MAX = 0.5; // max blob opacity (0..1) — lower = less "bubbly"
const DARK_BLOB_FRACTION = 0.38; // share of blobs that are shadows (multiply)
const BLOB_EDGE_MARGIN = 0.14; //   keep blob centres this far from the edges

// Diagonal sheen stripes (the silk highlight).
const SHEEN_COUNT = 2; //           number of stripes (2–4)
const SHEEN_CONTRAST = 0.4; //      stripe brightness (0..1) — fold visibility
const SHEEN_HALF_WIDTH = 0.04; //   half-width of each stripe along its axis

// Low-frequency soft noise.
const NOISE_STRENGTH = 0.07; //     noise opacity (0..1) — organic break-up
const NOISE_GRID_X = 24; //         coarse noise resolution (low = soft/large)
const NOISE_GRID_Y = 14;

// Edge calm — darken the borders so CLAMP_TO_EDGE doesn't streak bright pixels.
const EDGE_CALM = 0.95;

// --- Tiny seeded RNG + colour helpers ---------------------------------------

type Rgb = { r: number; g: number; b: number };

/** Deterministic 32-bit PRNG (mulberry32) so the texture is reproducible. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex: string): Rgb {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

const lighten = (c: Rgb, t: number) => mix(c, WHITE, t);
const darken = (c: Rgb, t: number) => mix(c, BLACK, t);

function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Draw a structural, dark, high-internal-contrast field in the given palette
 * and return it as a canvas usable as an OGL Texture image. Client-only.
 */
export function createPaletteCanvas(
  palette: readonly string[] = DEFAULT_PALETTE,
): HTMLCanvasElement {
  const W = TEXTURE_WIDTH;
  const H = TEXTURE_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const hex = palette.length >= 2 ? palette : DEFAULT_PALETTE;
  const colors = hex.map(parseHex);
  const rng = makeRng(SEED);

  // -- Layer 1: multi-directional dark base ---------------------------------
  // Solid deep fill, then two crossed gradients so light direction varies
  // across the field instead of marching along a single axis.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(BASE_RGB, 1);
  ctx.fillRect(0, 0, W, H);

  // Diagonal A (TL → BR), palette forward, kept deep.
  const gradA = ctx.createLinearGradient(0, 0, W, H);
  colors.forEach((c, i) => {
    gradA.addColorStop(i / (colors.length - 1), rgba(darken(c, 0.58), 1));
  });
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = gradA;
  ctx.fillRect(0, 0, W, H);

  // Diagonal B (BL → TR), palette reversed, screened in for cross-variation.
  const gradB = ctx.createLinearGradient(0, H, W, 0);
  [...colors].reverse().forEach((c, i) => {
    gradB.addColorStop(i / (colors.length - 1), rgba(darken(c, 0.45), 1));
  });
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = gradB;
  ctx.fillRect(0, 0, W, H);

  // -- Layer 2: marble clouds -----------------------------------------------
  // Seeded radial blobs. Light ones (screen/lighter) are highlights; dark ones
  // (multiply) are shadows. Together they give the field its smearable relief.
  for (let i = 0; i < BLOB_COUNT; i++) {
    const cx = lerp(BLOB_EDGE_MARGIN, 1 - BLOB_EDGE_MARGIN, rng()) * W;
    const cy = lerp(BLOB_EDGE_MARGIN, 1 - BLOB_EDGE_MARGIN, rng()) * H;
    const radius = lerp(BLOB_MIN_RADIUS, BLOB_MAX_RADIUS, rng()) * W;
    const intensity = lerp(BLOB_BRIGHTNESS_MIN, BLOB_BRIGHTNESS_MAX, rng());
    const base = colors[Math.floor(rng() * colors.length)]!;
    const isShadow = rng() < DARK_BLOB_FRACTION;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    if (isShadow) {
      // A coloured shadow: darkened palette tint that deepens the base.
      const shade = darken(base, 0.72);
      ctx.globalCompositeOperation = "multiply";
      grad.addColorStop(0, rgba(shade, intensity));
      grad.addColorStop(1, rgba(shade, 0));
    } else {
      // A highlight: brightened palette tint, additive at the core.
      const glow = lighten(base, 0.35);
      // Brightest blobs go additive (lighter) for a hot core; the rest screen.
      ctx.globalCompositeOperation = intensity > 0.7 ? "lighter" : "screen";
      grad.addColorStop(0, rgba(glow, intensity));
      grad.addColorStop(0.6, rgba(glow, intensity * 0.35));
      grad.addColorStop(1, rgba(glow, 0));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // -- Layer 3: diagonal sheen stripes --------------------------------------
  // Wide, soft, bright bands at a shallow diagonal — the signature silk gleam.
  // Alternating angle (±) keeps them from looking like parallel rails.
  const cx = W / 2;
  const cy = H / 2;
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < SHEEN_COUNT; i++) {
    // Shallow diagonal, tilted a touch differently per stripe.
    const sign = i % 2 === 0 ? 1 : -1;
    const angle = sign * (Math.PI / 180) * (28 + rng() * 14);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // Gradient axis spans the whole canvas projected onto the stripe normal.
    const span = Math.abs(dx) * W + Math.abs(dy) * H;
    const x0 = cx - dx * span * 0.5;
    const y0 = cy - dy * span * 0.5;
    const x1 = cx + dx * span * 0.5;
    const y1 = cy + dy * span * 0.5;

    // Tint the sheen toward whichever palette colour sits near it.
    const tint = lighten(colors[i % colors.length]!, 0.55);
    const center = lerp(0.25, 0.75, rng());
    const intensity = SHEEN_CONTRAST * lerp(0.7, 1, rng());

    const sheen = ctx.createLinearGradient(x0, y0, x1, y1);
    sheen.addColorStop(clamp01(center - SHEEN_HALF_WIDTH), rgba(tint, 0));
    sheen.addColorStop(center, rgba(tint, intensity));
    sheen.addColorStop(clamp01(center + SHEEN_HALF_WIDTH), rgba(tint, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
  }

  // -- Layer 4: low-frequency soft noise ------------------------------------
  // Render coarse seeded noise to a tiny offscreen canvas, then upscale it with
  // smoothing on. Bilinear upscaling turns the blocks into smooth, organic
  // low-frequency turbulence (not grain) that breaks up gradient banding.
  const noise = document.createElement("canvas");
  noise.width = NOISE_GRID_X;
  noise.height = NOISE_GRID_Y;
  const nctx = noise.getContext("2d");
  if (nctx) {
    const img = nctx.createImageData(NOISE_GRID_X, NOISE_GRID_Y);
    for (let p = 0; p < img.data.length; p += 4) {
      // Centre on mid-grey so "overlay" leaves average brightness unchanged.
      const v = Math.round(lerp(96, 160, rng()));
      img.data[p] = v;
      img.data[p + 1] = v;
      img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);

    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = NOISE_STRENGTH;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(noise, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
  }

  // -- Layer 5: edge vignette -----------------------------------------------
  // Settle the borders to the dark base. CLAMP_TO_EDGE repeats the edge texel
  // when the fluid samples past the boundary, so calm edges = no smear streaks.
  const vignette = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(W, H) * 0.25,
    cx,
    cy,
    Math.max(W, H) * 0.72,
  );
  vignette.addColorStop(0, rgba(BASE_RGB, 0));
  vignette.addColorStop(1, rgba(BASE_RGB, EDGE_CALM));
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Reset state for any later 2D use of this context.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  return canvas;
}
