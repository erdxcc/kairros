/**
 * Original GLSL (ES 3.00 / WebGL2) for the silk fluid field.
 *
 * A full incompressible Stable-Fluids (Navier–Stokes) solver with pressure
 * projection, run on a ping-pong RGBA16F grid. Channels: R,G = velocity.xy,
 * B = energy. Per-frame pass order:
 *   inject -> advect -> vorticity -> divergence -> pressure x10 -> project -> display
 *
 * Written from scratch from the recipe. Advection is near-inviscid (only a touch
 * of uViscosity smoothing) and a vorticity-confinement pass feeds back the swirl
 * numerical diffusion would otherwise eat, so the field stays "alive" and
 * inertial after the cursor stops. Shaders take a fullscreen Triangle:
 * position [-1,-1, 3,-1, -1,3].
 */

export const VERTEX = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/* 1. INJECT / FORCE — decay the field, then add each of the 8 pointers as an
 * anisotropic, velocity-stretched splat with a lead, ripples and side bands. */
export const INJECT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform float uTime;
uniform float uAspect;
uniform vec4 uTouch0; uniform vec4 uTouch1; uniform vec4 uTouch2; uniform vec4 uTouch3;
uniform vec4 uTouch4; uniform vec4 uTouch5; uniform vec4 uTouch6; uniform vec4 uTouch7;

// A loop can't index individual uniforms, so the splat body lives in a function
// called once per pointer.
void splat(vec4 t, vec2 p, float uAspect, float uTime, inout vec2 vel, inout float energy) {
  vec2 dir = t.zw;
  float raw = length(dir);
  // Deadzone: ignore sub-pixel jitter and the pointer-lerp tail when the cursor
  // is nearly still, so a near-stationary pointer stops pumping drift into the field.
  if (raw < 2e-4) return;
  // поджимаем: медленные движения подтягиваются к сильным
  float speed = sqrt(raw) * 0.9;
  if (speed < 1e-5) return;

  vec2 ndir = dir / speed;
  vec2 side = vec2(-ndir.y, ndir.x);

  // Inject slightly ahead of the cursor, scaled by speed.
  vec2 lead = vec2(t.x * uAspect, t.y) + ndir * (0.03 + speed * 0.6);
  vec2 d = p - lead;

  float along = dot(d, ndir);
  float across = dot(d, side);

  // Anisotropic falloff: longer, fading tail behind the head.
  // radius is the WIDTH knob — the footprint of each splat (and so the width of
  // the visible distortion, trail and dye). Lower = narrower, tighter to cursor.
  float radius = 0.008 + speed * 0.007;
  float tail = along < 0.0 ? 2.6 : 1.0;
  float shaped =
    (along * along) / (radius * radius * tail * tail) +
    (across * across) / (radius * radius * 0.5);
  float head = exp(-shaped);

  // Running ripples down the streak + soft side bands.
  float ripple = 0.65 + 0.35 * sin(along / radius * 6.2832 - uTime * 9.0);
  float bands = exp(-(across * across) / (radius * radius * 0.14)) *
                exp(-max(along, 0.0) / (radius * 2.0)) * 0.6;
  float amp = head * ripple + bands;

  // A little curl so the push shears instead of going perfectly straight.
  vec2 push = (ndir + side * across * 0.9) * speed;

  float strength = 22.0 + speed * 18.0;
  vel += push * amp * strength * 0.02;
  // Energy from RAW per-frame motion (not the sqrt-boosted speed): a slow drag
  // stays a small LOCAL fold, fast saturates — this is what keeps a slow drag from
  // translating the whole screen, while DISPLAY masks the silk smear by energy.
  energy = max(energy, amp * raw * 100.0);
}

void main() {
  vec4 field = texture(tField, vUv);
  // Velocity decays slowly here too (was 0.992) so impulse carries between
  // frames; energy keeps the faster decay so the visual still settles.
  vec2 vel = field.xy * 0.998;
  float energy = field.b * 0.992;

  // Aspect-corrected coordinate of this texel (grid is square, canvas is wide).
  vec2 p = vec2(vUv.x * uAspect, vUv.y);

  splat(uTouch0, p, uAspect, uTime, vel, energy);
  splat(uTouch1, p, uAspect, uTime, vel, energy);
  splat(uTouch2, p, uAspect, uTime, vel, energy);
  splat(uTouch3, p, uAspect, uTime, vel, energy);
  splat(uTouch4, p, uAspect, uTime, vel, energy);
  splat(uTouch5, p, uAspect, uTime, vel, energy);
  splat(uTouch6, p, uAspect, uTime, vel, energy);
  splat(uTouch7, p, uAspect, uTime, vel, energy);
  
  energy = clamp(energy, 0.0, 2.5);
  fragColor = vec4(vel, energy, 1.0);
}
`;

/* 2. ADVECT — semi-Lagrangian backtrace with only a whisper of viscosity.
 *
 * The old version followed the backtrace with a heavy multi-tap blur (4-neighbour
 * + diagonals + rings at 2 and 3 texels). That re-averaged the whole field every
 * frame and erased the vortices, so the flow died the instant the cursor stopped.
 * Now we keep the pure advection and mix in only a small share of the 4-neighbour
 * Laplacian (uViscosity) — just enough to suppress grid-scale noise/NaNs while
 * letting swirls survive. Vorticity confinement (pass 2b) then feeds back the
 * little curl this still costs. Velocity decays very slowly (0.999) so momentum
 * lingers; energy keeps its faster decay (0.992) so the visual still calms down.
 * Crucially, ONLY velocity is advected — energy is held in place, so the visible
 * mark (and the dye it gates) stays where the cursor passed and never streaks out
 * to the borders on the long-lived flow. */
export const ADVECT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform vec2 uTexel;
uniform float uViscosity; // 0 = inviscid (max vortices), ~0.1 = a touch of smoothing
uniform float uMaxVel;    // clamp on velocity magnitude so inertia can't run away

void main() {
  vec4 here = texture(tField, vUv);

  // Self-advection of VELOCITY ONLY — trace velocity backwards through the field.
  // This is what gives the flow its inertia and swirl.
  vec2 src = vUv - here.xy * uTexel * 0.065 * 40.0;
  vec2 vAdv = texture(tField, src).xy;

  // Very light viscosity: blend the advected velocity toward its 4-neighbour
  // average by uViscosity only. No diagonals, no outer rings.
  vec2 e = uTexel;
  vec2 lap = 0.25 * (
    texture(tField, src + vec2( e.x, 0.0)).xy +
    texture(tField, src + vec2(-e.x, 0.0)).xy +
    texture(tField, src + vec2(0.0,  e.y)).xy +
    texture(tField, src + vec2(0.0, -e.y)).xy
  );
  vec2 vel = mix(vAdv, lap, uViscosity);

  // Energy is held IN PLACE — deliberately NOT advected. Energy is the mask that
  // gates BOTH the visible distortion and the dye, so carrying it on the
  // long-lived, whole-screen velocity field is exactly what painted marks into
  // regions the cursor never touched (long tails to every border from a tiny
  // move). Kept in place it just fades where the cursor actually was.
  float energy = here.b;

  vel *= 0.999;     // momentum lives much longer than before (inertia)

  // Clamp the magnitude: with such slow decay a sustained drag/scroll would
  // otherwise let velocity accumulate to huge values, blowing up every
  // velocity-driven offset downstream (the screen-spanning tails). Inertia (the
  // slow decay) is unchanged — only the peak magnitude is bounded.
  float vl = length(vel);
  if (vl > uMaxVel) vel *= uMaxVel / vl;

  energy *= 0.992;  // energy fades in place so the silk still settles visually
  fragColor = vec4(vel, energy, 1.0);
}
`;

/* 2b. VORTICITY CONFINEMENT — restore the small-scale swirl that numerical
 * diffusion eats (Fedkiw/Stam). For each cell:
 *   curl  w  = (vR.y - vL.y) - (vT.x - vB.x)
 *   N        = normalize(grad(|w|))           (eps in the denominator)
 *   force F  = uVorticity * (N.y * w, -N.x * w)
 * Adding F back along the vortex keeps eddies spinning instead of smearing flat.
 * Runs between ADVECT and DIVERGENCE; PROJECT afterwards re-enforces incompress. */
export const VORTICITY = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform vec2 uTexel;
uniform float uVorticity; // confinement strength (0 = off)

// Scalar 2D curl of the velocity field at a UV, from its 4 neighbours.
float curl(vec2 uv) {
  vec2 vL = texture(tField, uv - vec2(uTexel.x, 0.0)).xy;
  vec2 vR = texture(tField, uv + vec2(uTexel.x, 0.0)).xy;
  vec2 vB = texture(tField, uv - vec2(0.0, uTexel.y)).xy;
  vec2 vT = texture(tField, uv + vec2(0.0, uTexel.y)).xy;
  return (vR.y - vL.y) - (vT.x - vB.x);
}

void main() {
  vec4 here = texture(tField, vUv);
  float energy = clamp(here.b, 0.0, 2.0);

  // Confine ONLY where there's real flow. In calm regions grad(|curl|) is just
  // grid noise and normalize() would amplify it into a carpet of tiny vortices
  // (the "комочки"); gating by energy keeps confinement to the live area near the
  // cursor and leaves the rest of the field perfectly smooth.
  float gate = smoothstep(0.06, 0.4, energy);
  if (gate <= 0.0) { fragColor = here; return; }

  // Curl at this cell and its neighbours (for the gradient of |curl|).
  float wC = curl(vUv);
  float wL = curl(vUv - vec2(uTexel.x, 0.0));
  float wR = curl(vUv + vec2(uTexel.x, 0.0));
  float wB = curl(vUv - vec2(0.0, uTexel.y));
  float wT = curl(vUv + vec2(0.0, uTexel.y));

  // N points up the gradient of vorticity magnitude; the confinement force then
  // pushes velocity tangentially around the vortex core, re-spinning the eddy.
  vec2 grad = 0.5 * vec2(abs(wR) - abs(wL), abs(wT) - abs(wB));
  vec2 N = grad / (length(grad) + 1e-5);
  vec2 force = uVorticity * gate * vec2(N.y * wC, -N.x * wC);

  fragColor = vec4(here.xy + force, here.b, here.a);
}
`;

/* 3. DIVERGENCE — 0.5 * ((right.x - left.x) + (top.y - bottom.y)). */
export const DIVERGENCE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform vec2 uTexel;

void main() {
  float left   = texture(tField, vUv - vec2(uTexel.x, 0.0)).x;
  float right  = texture(tField, vUv + vec2(uTexel.x, 0.0)).x;
  float bottom = texture(tField, vUv - vec2(0.0, uTexel.y)).y;
  float top    = texture(tField, vUv + vec2(0.0, uTexel.y)).y;
  float div = 0.5 * ((right - left) + (top - bottom));
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

/* 4. PRESSURE (Jacobi) — one iteration; run 10 times ping-ponging pressure. */
export const PRESSURE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tPressure;
uniform sampler2D tDivergence;
uniform vec2 uTexel;

void main() {
  float left   = texture(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right  = texture(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float bottom = texture(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  float top    = texture(tPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div    = texture(tDivergence, vUv).x;
  float pressure = (left + right + bottom + top - div) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

/* 5. PROJECTION — subtract the pressure gradient to make the field
 * divergence-free, then fade velocity toward the edges. */
export const PROJECT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform sampler2D tPressure;
uniform vec2 uTexel;

void main() {
  vec4 field = texture(tField, vUv);
  float left   = texture(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right  = texture(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float bottom = texture(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  float top    = texture(tPressure, vUv + vec2(0.0, uTexel.y)).x;

  vec2 vel = field.xy - 0.5 * vec2(right - left, top - bottom);

  // Edge fade so velocity doesn't stick to the boundaries.
  float edge =
    smoothstep(0.0, 0.07, vUv.x) * smoothstep(0.0, 0.07, 1.0 - vUv.x) *
    smoothstep(0.0, 0.07, vUv.y) * smoothstep(0.0, 0.07, 1.0 - vUv.y);
  vel *= edge;

  fragColor = vec4(vel, field.b, 1.0);
}
`;

/* 5b. DYE — the real "fluid memory" (Part C). A material field that records the
 * silk where the flow is energetic and dissolves it slowly in place; DISPLAY
 * blends it back so the trace lingers AFTER the cursor leaves instead of the
 * texture snapping back to the source. It is deliberately NOT advected by the
 * velocity: the field is divergence-free and spans the whole screen, so carrying
 * a long-lived dye by it would smear material into regions the cursor never
 * touched (tails to every side). Kept in place, the trace appears ONLY where the
 * cursor actually passed. Only injected where there's flow, so calm stays clean. */
export const DYE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tDye;    // previous dye (RGB = carried material, A = density)
uniform sampler2D tField;  // velocity (RG) + energy (B), post-projection
uniform sampler2D tMap;    // base silk texture (the material being carried)
uniform vec2 uTexel;
uniform float uDistortion; // matches DISPLAY so deposited material lines up
uniform float uAdvect;     // how far dye travels with the flow per frame
uniform float uDecay;      // slow dissolve per frame (closer to 1 = longer memory)
uniform float uInject;     // how much new material the energetic flow picks up

void main() {
  vec4 f = texture(tField, vUv);
  vec2 vel = f.xy;
  float energy = clamp(f.b, 0.0, 2.0);

  // Read the dye IN PLACE — it is NOT carried by the flow (uAdvect defaults to 0).
  // Advecting it by the divergence-free, whole-screen velocity field is exactly
  // what dragged material into untouched regions and drew tails to every side.
  // (Raise uAdvect only if you want a subtle drift and can accept faint spread.)
  vec2 src = vUv - vel * uTexel * uAdvect;
  vec4 dye = texture(tDye, src);

  // Slow dissolve — the wake fades over a second or two, not instantly.
  dye *= uDecay;

  // Pick up new material where the flow is energetic. The sampled colour is the
  // velocity-smeared silk (same offset DISPLAY uses), so the dye is literally
  // displaced silk left behind in the wake.
  float inject = smoothstep(0.08, 0.5, energy) * uInject;
  vec3 mat = texture(tMap, vUv - vel * uDistortion * 0.5).rgb;
  dye.rgb = mix(dye.rgb, mat, inject);
  dye.a = clamp(dye.a + inject, 0.0, 1.0);

  fragColor = dye;
}
`;

/* 6. DISPLAY — distort the base tMap by the velocity field (energy-masked) + idle
 * wind, layer trail / smoke / oil shimmer / a faint chromatic shift, kept dark. */
export const DISPLAY = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform sampler2D tMap;
uniform sampler2D tDye;
uniform float uDistortion;
uniform float uBlackOverlay;
uniform float uTime;
uniform float uWind;
uniform float uCalm;
uniform float uDyeMix;
uniform float uMaxFold; // hard cap on the fold offset (UV) — keeps the smear local

// Soft, slow, swirly field used as the idle "wind" that ripples the silk. Lower
// spatial frequencies = larger, more readable billows; faster time = livelier.
vec2 windField(vec2 p, float t) {
  float a = sin(p.x * 4.0 + t * 0.55) + cos(p.y * 5.0 - t * 0.42);
  float b = sin(p.y * 3.5 - t * 0.48) + cos(p.x * 6.0 + t * 0.37);
  return vec2(b, -a);
}

void main() {
  vec4 field = texture(tField, vUv);
  vec2 vel = field.xy;
  float energy = clamp(field.b, 0.0, 2.0);
  float speed = length(vel);
  vec2 dir = speed > 1e-5 ? vel / speed : vec2(0.0);

  // Energy mask: 0 in calm zones, ramps to 1 only where the field is energetic
  // (right around the cursor). This gates EVERY velocity-driven distortion so the
  // corners of the screen hold perfectly still on a slow drag. The time-based
  // wind / oil shimmer below is deliberately left UNmasked — that's the ambient
  // "wind" we want to keep.
  float mask = smoothstep(0.04, 0.3, energy);

  // Idle "wind": ambient time-based ripple, always on, hushed while dragging.
  vec2 wind = windField(vUv, uTime) * uWind * uCalm;

  // Velocity displacement vector, MAGNITUDE-CAPPED so the fold always stays local.
  // The field is now inertial and its velocity can accumulate to very large values
  // during a drag/scroll. The offset is ~vel, so WITHOUT this cap a single move
  // drags the texture one-to-several screen widths and it reads as a long ray/tail
  // streaking to the nearest edge (the bug). Capping the length keeps a compact
  // silk fold no matter how energetic the flow gets.
  vec2 gv = vel * uDistortion * mask;
  float gvl = length(gv);
  if (gvl > uMaxFold) gv *= uMaxFold / gvl;

  vec2 dUv = vUv - gv * (0.05 + energy * 0.9) - wind;
  vec3 color = texture(tMap, dUv).rgb;

  // Trail: a few samples dragged along the (capped) flow — silky smear, local.
  vec3 trail = vec3(0.0);
  for (int i = 1; i <= 4; i++) {
    float f = float(i) / 4.0;
    trail += texture(tMap, dUv - gv * f * 0.5).rgb;
  }
  trail *= 0.25;

  // Smoke: wider, softer drift — masked.
  vec3 smoke = texture(tMap, dUv - dir * (0.03 + energy * 0.05) * mask).rgb;

  // Oil shimmer: time-based palette swirl. INTENTIONALLY left unmasked (ambient).
  float shimmer = sin(dot(vUv, vec2(11.0, 9.0)) + dot(dir, vUv) * 7.0 +
                      energy * 5.0 + uTime * 0.6);
  vec3 oil = texture(tMap, dUv + dir * shimmer * 0.02).rgb;

  // Faint chromatic shift on R/B — masked so it doesn't ride the whole screen.
  vec2 chroma = vel * 0.007 * mask;
  float r = texture(tMap, dUv + chroma).r;
  float b = texture(tMap, dUv - chroma).b;
  vec3 chromaCol = vec3(r, color.g, b);

  vec3 outColor = color;
  outColor = mix(outColor, trail, 0.28 * clamp(energy * 1.4, 0.0, 1.0));
  outColor = mix(outColor, smoke, 0.82 * clamp(energy, 0.0, 1.0));
  outColor = mix(outColor, oil, 0.2 * clamp(energy * 1.2, 0.0, 1.0));
  outColor = mix(outColor, chromaCol, (0.02 + speed * 0.12) * mask);

  // Fluid memory (Part C): advected dye that lingers where the flow carried
  // material and dissolves slowly. Gated by its own density (A), NOT by energy,
  // so the wake stays visible AFTER the cursor stops — this is what kills the
  // "snaps straight back to the source" feel. Sampled with the ambient wind so
  // the memory layer breathes too. Calm corners never accumulate dye → stay clean.
  vec4 dye = texture(tDye, vUv - wind);
  outColor = mix(outColor, dye.rgb, clamp(dye.a, 0.0, 1.0) * uDyeMix);

  // Keep it dark.
  outColor = mix(outColor, vec3(0.027, 0.027, 0.043), uBlackOverlay);

  fragColor = vec4(outColor, 1.0);
}
`;
