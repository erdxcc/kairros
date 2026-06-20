/**
 * GrainOverlay — a fixed, non-interactive film-grain layer over the whole page.
 *
 * Original generated placeholder: an inline SVG `feTurbulence` mask, no external
 * asset. Kept subtle to add premium texture and reduce gradient banding on dark
 * surfaces. Purely presentational, so it can render on the server.
 */
const GRAIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
     <filter id="n">
       <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
       <feColorMatrix type="saturate" values="0"/>
     </filter>
     <rect width="100%" height="100%" filter="url(#n)"/>
   </svg>`,
);

export function GrainOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] opacity-[0.035] mix-blend-soft-light"
      style={{
        backgroundImage: `url("data:image/svg+xml,${GRAIN_SVG}")`,
        backgroundSize: "160px 160px",
      }}
    />
  );
}
