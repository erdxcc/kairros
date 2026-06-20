/**
 * Original GLSL (ES 3.00 / WebGL2) for the silk fluid field.
 *
 * A full incompressible Stable-Fluids (Navier–Stokes) solver with pressure
 * projection, run on a ping-pong RGBA16F grid. Channels: R,G = velocity.xy,
 * B = energy. Per-frame pass order:
 *   inject -> advect+diffuse -> divergence -> pressure x10 -> project -> display
 *
 * Written from scratch from the recipe; the numeric constants (0.998 damping,
 * 0.065 advection step, 0.56 distortion, 10 Jacobi iterations) come from the
 * spec. Shaders take a fullscreen Triangle: position [-1,-1, 3,-1, -1,3].
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
  if (raw < 1e-5) return;
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
  float radius = 0.025 + speed * 0.015;
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
  energy = max(energy, amp * (0.2 + speed * 20.0));
}

void main() {
  vec4 field = texture(tField, vUv);
  vec2 vel = field.xy * 0.992;
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

/* 2. ADVECT + DIFFUSE — semi-Lagrangian backtrace plus a multi-tap blur
 * (4-neighbour, diagonals, rings at 2 and 3 texels) and ×0.998 damping. */
export const ADVECT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform vec2 uTexel;

void main() {
  vec4 here = texture(tField, vUv);

  // Self-advection: trace velocity backwards through the field.
  vec2 src = vUv - here.xy * uTexel * 0.065 * 40.0;
  vec4 advected = texture(tField, src);

  // Multi-tap diffusion.
  vec4 sum = advected * 4.0;
  vec2 e = uTexel;

  // 4-neighbour
  sum += texture(tField, src + vec2( e.x, 0.0)) * 2.0;
  sum += texture(tField, src + vec2(-e.x, 0.0)) * 2.0;
  sum += texture(tField, src + vec2(0.0,  e.y)) * 2.0;
  sum += texture(tField, src + vec2(0.0, -e.y)) * 2.0;

  // diagonals
  sum += texture(tField, src + vec2( e.x,  e.y));
  sum += texture(tField, src + vec2(-e.x,  e.y));
  sum += texture(tField, src + vec2( e.x, -e.y));
  sum += texture(tField, src + vec2(-e.x, -e.y));

  // rings at 2 and 3 texels
  sum += texture(tField, src + vec2( 2.0 * e.x, 0.0)) * 0.5;
  sum += texture(tField, src + vec2(-2.0 * e.x, 0.0)) * 0.5;
  sum += texture(tField, src + vec2(0.0,  2.0 * e.y)) * 0.5;
  sum += texture(tField, src + vec2(0.0, -2.0 * e.y)) * 0.5;
  sum += texture(tField, src + vec2( 3.0 * e.x, 0.0)) * 0.25;
  sum += texture(tField, src + vec2(-3.0 * e.x, 0.0)) * 0.25;
  sum += texture(tField, src + vec2(0.0,  3.0 * e.y)) * 0.25;
  sum += texture(tField, src + vec2(0.0, -3.0 * e.y)) * 0.25;

  float wsum = 4.0 + 8.0 + 4.0 + 2.0 + 1.0;
  vec4 result = sum / wsum;

  result.xy *= 0.992;
  result.b *= 0.992;
  fragColor = result;
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

/* 6. DISPLAY — distort the base tMap by velocity and layer trail / smoke / oil
 * shimmer / a faint chromatic shift, mixed by energy and kept dark. */
export const DISPLAY = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D tField;
uniform sampler2D tMap;
uniform float uDistortion;
uniform float uBlackOverlay;
uniform float uTime;

void main() {
  vec4 field = texture(tField, vUv);
  vec2 vel = field.xy;
  float energy = clamp(field.b, 0.0, 2.0);
  float speed = length(vel);
  vec2 dir = speed > 1e-5 ? vel / speed : vec2(0.0);

  // Base distorted sample.
  float mask = smoothstep(0.02, 0.25, energy);
  vec2 dUv = vUv - vel * uDistortion * (0.04 + energy * 0.94)*mask;
  vec3 color = texture(tMap, dUv).rgb;

  // Trail: a few samples dragged along the flow (silky smear).
  vec3 trail = vec3(0.0);
  for (int i = 1; i <= 4; i++) {
    float f = float(i) / 4.0;
    trail += texture(tMap, dUv - vel * uDistortion * f * 0.5).rgb;
  }
  trail *= 0.25;

  // Smoke: wider, softer drift.
  vec3 smoke = texture(tMap, dUv - dir * (0.03 + energy * 0.05)).rgb;

  // Oil shimmer: palette swirl modulated by direction, energy and time.
  float shimmer = sin(dot(vUv, vec2(11.0, 9.0)) + dot(dir, vUv) * 7.0 +
                      energy * 5.0 + uTime * 0.6);
  vec3 oil = texture(tMap, dUv + dir * shimmer * 0.02).rgb;

  // Faint chromatic shift on R/B.
  vec2 chroma = vel * 0.007;
  float r = texture(tMap, dUv + chroma).r;
  float b = texture(tMap, dUv - chroma).b;
  vec3 chromaCol = vec3(r, color.g, b);

  vec3 outColor = color;
  outColor = mix(outColor, trail, 0.28 * clamp(energy * 1.4, 0.0, 1.0));
  outColor = mix(outColor, smoke, 0.82 * clamp(energy, 0.0, 1.0));
  outColor = mix(outColor, oil, 0.2 * clamp(energy * 1.2, 0.0, 1.0));
  outColor = mix(outColor, chromaCol, 0.02 + speed * 0.12);

  // Keep it dark.
  outColor = mix(outColor, vec3(0.027, 0.027, 0.043), uBlackOverlay);

  fragColor = vec4(outColor, 1.0);
}
`;
