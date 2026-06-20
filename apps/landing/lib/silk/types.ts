/** Public types for the framework-agnostic silk fluid field. */

export interface SilkOptions {
  /**
   * Gradient stops for the base texture (tMap). Defaults to the Kairos
   * violet -> cyan -> teal palette.
   */
  palette?: string[];
  /** Cap on devicePixelRatio for the display pass. Defaults to 2. */
  maxDpr?: number;
  /** Distortion strength applied in the display pass. Defaults to 0.56. */
  distortion?: number;
  /** Black overlay alpha kept on top to keep the field dark. Defaults to 0.2. */
  blackOverlayAlpha?: number;
}

export interface ResolvedSilkOptions {
  palette: string[];
  maxDpr: number;
  distortion: number;
  blackOverlayAlpha: number;
}

/** One smoothed pointer fed into the simulation as a vec4(x, y, vx, vy). */
export interface Pointer {
  /** Smoothed, aspect-corrected position in [0,1]. */
  x: number;
  y: number;
  /** Smoothed velocity (aspect-corrected units per frame). */
  vx: number;
  vy: number;
  /** Raw target position the smoothed value chases. */
  targetX: number;
  targetY: number;
  /** Whether the pointer is currently over the canvas. */
  inside: boolean;
}
