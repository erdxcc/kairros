/**
 * Base texture (tMap) generation.
 *
 * The original reference fed a raster art asset into the fluid; we have no such
 * asset, so we generate our own smooth gradient on a 2D canvas (one time) in the
 * brand palette and hand it to OGL as a Texture. This is the "image" the fluid
 * liquefies — NOT page content.
 */

export const DEFAULT_PALETTE = ["#8b5cf6", "#22d3ee", "#14f195"] as const;

const TEXTURE_SIZE = 512;

/**
 * Draw a soft, dark, multi-stop gradient field in the given palette and return
 * it as a canvas usable as an OGL Texture image. Combines a diagonal linear
 * base with a couple of radial pools so the fluid has structure to smear.
 */
export function createPaletteCanvas(
  palette: readonly string[] = DEFAULT_PALETTE,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const colors = palette.length >= 2 ? palette : DEFAULT_PALETTE;

  // Dark base so the field reads as deep, not neon.
  ctx.fillStyle = "#07070b";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  // Diagonal linear gradient through the palette.
  const linear = ctx.createLinearGradient(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  colors.forEach((color, index) => {
    linear.addColorStop(index / (colors.length - 1), color);
  });
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  // Radial pools to give the gradient some local variation to advect.
  const pools: Array<{ x: number; y: number; r: number; color: string }> = [
    { x: 0.28, y: 0.32, r: 0.55, color: colors[0]! },
    { x: 0.74, y: 0.4, r: 0.5, color: colors[1] ?? colors[0]! },
    { x: 0.52, y: 0.78, r: 0.6, color: colors[colors.length - 1]! },
  ];

  ctx.globalAlpha = 0.5;
  for (const pool of pools) {
    const radial = ctx.createRadialGradient(
      pool.x * TEXTURE_SIZE,
      pool.y * TEXTURE_SIZE,
      0,
      pool.x * TEXTURE_SIZE,
      pool.y * TEXTURE_SIZE,
      pool.r * TEXTURE_SIZE,
    );
    radial.addColorStop(0, pool.color);
    radial.addColorStop(1, "rgba(7,7,11,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }

  ctx.globalAlpha = 1;
  return canvas;
}
