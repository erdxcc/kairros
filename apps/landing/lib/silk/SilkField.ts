import { Renderer, Program, Mesh, Triangle, RenderTarget, Texture } from "ogl";
import {
  VERTEX,
  INJECT,
  ADVECT,
  VORTICITY,
  DIVERGENCE,
  PRESSURE,
  PROJECT,
  DYE,
  DISPLAY,
} from "./shaders";
import { createPaletteCanvas, DEFAULT_PALETTE } from "./palette";
import type { SilkOptions, ResolvedSilkOptions, Pointer } from "./types";

const SIM_SIZE = 280; // fixed simulation grid (independent of screen / DPR)
const TEXEL = 1 / SIM_SIZE;
const PRESSURE_ITERATIONS = 10;
const POINTER_COUNT = 8;
const POINTER_LERP = 0.2;

// Solver "feel" tunables (Part B — inertia & physical settling).
const VISCOSITY = 0.18; //          ADVECT smoothing: low = more vortices, higher = fewer lumps
const VORTICITY_STRENGTH = 0.2; //  vorticity-confinement strength (energy-gated, no calm-zone lumps)
const MAX_VEL = 3.0; //             clamp on field velocity magnitude (stops inertial runaway)
const MAX_FOLD = 0.03; //           hard cap on the DISPLAY fold offset in UV (no screen-spanning tails)

// Dye field ("fluid memory", Part C) + idle-wind tunables.
const DYE_ADVECT = 0; //        0 = trace stays where the cursor passed (no flow-carried tails); >0 drifts
const DYE_DECAY = 0.99; //      slow dissolve per frame: closer to 1 = longer-lasting wake
const DYE_INJECT = 0.12; //     how much new silk the energetic flow deposits per frame
const DYE_MIX = 0.5; //         how strongly the lingering dye shows over the base
const WIND_STRENGTH = 0.04; //  idle wind ripple amplitude
const CALM_THRESHOLD = 0.004; // pointer speed above which the wind is hushed
const CALM_SMOOTH = 0.04; //    how fast the wind ramps in / out

type GL = Renderer["gl"];

interface DoubleFBO {
  read: RenderTarget;
  write: RenderTarget;
  swap(): void;
}

/**
 * Framework-agnostic silk fluid field (OGL only — no Next/React imports).
 *
 * A full Stable-Fluids solver on a ping-pong RGBA16F grid. Requires WebGL2 and
 * EXT_color_buffer_float; {@link mount} returns false when unsupported so the
 * caller can fall back to a static gradient.
 */
export class SilkField {
  private renderer: Renderer | null = null;
  private gl: GL | null = null;
  private canvas: HTMLCanvasElement | null = null;

  private opts: ResolvedSilkOptions = {
    palette: [...DEFAULT_PALETTE],
    maxDpr: 2,
    distortion: 0.56,
    blackOverlayAlpha: 0.2,
  };

  private field!: DoubleFBO;
  private pressure!: DoubleFBO;
  private dye!: DoubleFBO;
  private divergence!: RenderTarget;
  private tMap!: Texture;

  private injectMesh!: Mesh;
  private advectMesh!: Mesh;
  private vorticityMesh!: Mesh;
  private divergenceMesh!: Mesh;
  private pressureMesh!: Mesh;
  private projectMesh!: Mesh;
  private dyeMesh!: Mesh;
  private displayMesh!: Mesh;

  private touch = new Float32Array(POINTER_COUNT * 4);
  private pointers: Pointer[] = [];
  private pointerSlots = new Map<number, number>();

  private raf = 0;
  private time = 0;
  private lastFrame = 0;
  private aspect = 1;
  private calm = 1; // 0..1, 1 when the pointer is idle (drives the wind)

  private mounted = false;
  private visible = true;
  private inView = true;

  // Bound handlers (kept for clean removal)
  private onPointerMove = (e: PointerEvent) => this.handlePointer(e, true);
  private onPointerDown = (e: PointerEvent) => this.handlePointer(e, true);
  private onPointerUp = (e: PointerEvent) => this.releasePointer(e);
  private onVisibility = () => {
    this.visible = !document.hidden;
    this.updateRunState();
  };

  /** Initialise GL + simulation. Returns false if WebGL2/float RT unsupported. */
  mount(canvas: HTMLCanvasElement, opts: SilkOptions = {}): boolean {
    this.canvas = canvas;
    this.opts = {
      palette: opts.palette ?? [...DEFAULT_PALETTE],
      maxDpr: opts.maxDpr ?? 2,
      distortion: opts.distortion ?? 0.56,
      blackOverlayAlpha: opts.blackOverlayAlpha ?? 0.2,
    };

    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    const renderer = new Renderer({
      canvas,
      width: canvas.clientWidth || 1,
      height: canvas.clientHeight || 1,
      dpr,
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
    });

    const gl = renderer.gl;

    // Hard requirements for a renderable half-float field.
    if (!renderer.isWebgl2 || !gl.getExtension("EXT_color_buffer_float")) {
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
      return false;
    }

    this.renderer = renderer;
    this.gl = gl;

    this.initPointers();
    this.initTargets();
    this.initPrograms();
    this.setPalette(this.opts.palette);
    this.resize();

    this.mounted = true;
    this.lastFrame = performance.now();

    canvas.addEventListener("pointermove", this.onPointerMove, { passive: true });
    canvas.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this.onPointerUp, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);

    this.updateRunState();
    return true;
  }

  /** Toggle the in-view state (driven by the React wrapper's observer). */
  setInView(inView: boolean): void {
    this.inView = inView;
    this.updateRunState();
  }

  resize(): void {
    if (!this.renderer || !this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    this.renderer.dpr = dpr;
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.aspect = w / h;
    this.injectMesh.program.uniforms.uAspect.value = this.aspect;
  }

  setPalette(colors: string[]): void {
    if (!this.gl) return;
    const gl = this.gl;
    const image = createPaletteCanvas(colors);
    const tex = new Texture(gl, {
      image,
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
    this.tMap = tex;
    if (this.displayMesh) {
      this.displayMesh.program.uniforms.tMap.value = tex;
    }
  }

  destroy(): void {
    this.pause();
    this.mounted = false;
    if (this.canvas) {
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    }
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("visibilitychange", this.onVisibility);

    const gl = this.gl;
    if (gl) {
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    }
    this.renderer = null;
    this.gl = null;
    this.canvas = null;
  }

  // ----------------------------------------------------------------------- //
  // Internals
  // ----------------------------------------------------------------------- //

  private initPointers(): void {
    this.pointers = Array.from({ length: POINTER_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      targetX: 0.5,
      targetY: 0.5,
      inside: false,
    }));
  }

  private makeFBO(): RenderTarget {
    const gl = this.gl!;
    // gl is guaranteed WebGL2 here (checked in mount); narrow for WebGL2-only
    // enums HALF_FLOAT / RGBA16F.
    const gl2 = gl as WebGL2RenderingContext;
    return new RenderTarget(gl, {
      width: SIM_SIZE,
      height: SIM_SIZE,
      type: gl2.HALF_FLOAT,
      format: gl.RGBA,
      internalFormat: gl2.RGBA16F,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      depth: false,
    });
  }

  private makeDoubleFBO(): DoubleFBO {
    const a = this.makeFBO();
    const b = this.makeFBO();
    const fbo: DoubleFBO = {
      read: a,
      write: b,
      swap() {
        const t = this.read;
        this.read = this.write;
        this.write = t;
      },
    };
    return fbo;
  }

  private initTargets(): void {
    this.field = this.makeDoubleFBO();
    this.pressure = this.makeDoubleFBO();
    this.dye = this.makeDoubleFBO();
    this.divergence = this.makeFBO();
    // Zero everything so the half-float buffers never start with garbage/NaN.
    this.clearTarget(this.field.read);
    this.clearTarget(this.field.write);
    this.clearTarget(this.pressure.read);
    this.clearTarget(this.pressure.write);
    this.clearTarget(this.dye.read, 0);
    this.clearTarget(this.dye.write, 0);
    this.clearTarget(this.divergence);
  }

  // alpha defaults to 1; the dye buffer must clear to 0 because there alpha is the
  // material density — starting at 1 would tint the whole screen black until decay.
  private clearTarget(rt: RenderTarget, alpha = 1): void {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.buffer);
    gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
    gl.clearColor(0, 0, 0, alpha);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private makeMesh(fragment: string, uniforms: Record<string, { value: unknown }>): Mesh {
    const gl = this.gl!;
    const program = new Program(gl, {
      vertex: VERTEX,
      fragment,
      uniforms,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    return new Mesh(gl, { geometry: new Triangle(gl), program });
  }

  private initPrograms(): void {
    const texel: [number, number] = [TEXEL, TEXEL];

    this.injectMesh = this.makeMesh(INJECT, {
      tField: { value: null },
      uTime: { value: 0 },
      uAspect: { value: this.aspect },
      uTouch0: { value: new Float32Array(4) },
      uTouch1: { value: new Float32Array(4) },
      uTouch2: { value: new Float32Array(4) },
      uTouch3: { value: new Float32Array(4) },
      uTouch4: { value: new Float32Array(4) },
      uTouch5: { value: new Float32Array(4) },
      uTouch6: { value: new Float32Array(4) },
      uTouch7: { value: new Float32Array(4) },
    });

    this.advectMesh = this.makeMesh(ADVECT, {
      tField: { value: null },
      uTexel: { value: texel },
      uViscosity: { value: VISCOSITY },
      uMaxVel: { value: MAX_VEL },
    });

    this.vorticityMesh = this.makeMesh(VORTICITY, {
      tField: { value: null },
      uTexel: { value: texel },
      uVorticity: { value: VORTICITY_STRENGTH },
    });

    this.divergenceMesh = this.makeMesh(DIVERGENCE, {
      tField: { value: null },
      uTexel: { value: texel },
    });

    this.pressureMesh = this.makeMesh(PRESSURE, {
      tPressure: { value: null },
      tDivergence: { value: null },
      uTexel: { value: texel },
    });

    this.projectMesh = this.makeMesh(PROJECT, {
      tField: { value: null },
      tPressure: { value: null },
      uTexel: { value: texel },
    });

    this.dyeMesh = this.makeMesh(DYE, {
      tDye: { value: null },
      tField: { value: null },
      tMap: { value: null },
      uTexel: { value: texel },
      uDistortion: { value: this.opts.distortion },
      uAdvect: { value: DYE_ADVECT },
      uDecay: { value: DYE_DECAY },
      uInject: { value: DYE_INJECT },
    });

    this.displayMesh = this.makeMesh(DISPLAY, {
      tField: { value: null },
      tDye: { value: null },
      tMap: { value: null },
      uDistortion: { value: this.opts.distortion },
      uBlackOverlay: { value: this.opts.blackOverlayAlpha },
      uTime: { value: 0 },
      uWind: { value: WIND_STRENGTH },
      uCalm: { value: 1 },
      uDyeMix: { value: DYE_MIX },
      uMaxFold: { value: MAX_FOLD },
    });
  }

  private handlePointer(e: PointerEvent, inside: boolean): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = 1 - (e.clientY - rect.top) / rect.height; // flip Y to UV space

    const slot = this.slotFor(e.pointerId);
    const p = this.pointers[slot]!;
    if (!p.inside) {
      // Snap on first contact so we don't fling a splat from the old position.
      p.x = nx;
      p.y = ny;
    }
    p.targetX = nx;
    p.targetY = ny;
    p.inside = inside;
  }

  private releasePointer(e: PointerEvent): void {
    const slot = this.pointerSlots.get(e.pointerId);
    if (slot === undefined) return;
    const p = this.pointers[slot]!;
    p.inside = false;
    this.pointerSlots.delete(e.pointerId);
  }

  private slotFor(pointerId: number): number {
    const existing = this.pointerSlots.get(pointerId);
    if (existing !== undefined) return existing;
    // Find a free slot; fall back to slot 0 if all are busy.
    let slot = 0;
    for (let i = 0; i < POINTER_COUNT; i++) {
      if (!this.pointers[i]!.inside && !this.isSlotTaken(i)) {
        slot = i;
        break;
      }
    }
    this.pointerSlots.set(pointerId, slot);
    return slot;
  }

  private isSlotTaken(slot: number): boolean {
    for (const value of this.pointerSlots.values()) {
      if (value === slot) return true;
    }
    return false;
  }

  private updatePointers(): void {
    let activity = 0;
    for (let i = 0; i < POINTER_COUNT; i++) {
      const p = this.pointers[i]!;
      const prevX = p.x;
      const prevY = p.y;
      p.x += (p.targetX - p.x) * POINTER_LERP;
      p.y += (p.targetY - p.y) * POINTER_LERP;
      p.vx = p.x - prevX;
      p.vy = p.y - prevY;

      const base = i * 4;
      const active = p.inside ? 1 : 0;
      this.touch[base] = p.x;
      this.touch[base + 1] = p.y;
      // Aspect-correct velocity so direction matches the squashed grid; zero it
      // out when the pointer isn't engaged so the splat fades cleanly.
      this.touch[base + 2] = p.vx * this.aspect * active;
      this.touch[base + 3] = p.vy * active;

      if (active) activity = Math.max(activity, Math.hypot(p.vx, p.vy));
    }

    // Smoothly track how "calm" the pointer is so the wind ramps in when the
    // cursor settles and is hushed while the user is actively dragging.
    const targetCalm = 1 - Math.min(activity / CALM_THRESHOLD, 1);
    this.calm += (targetCalm - this.calm) * CALM_SMOOTH;

    // Mirror the packed touch buffer into the 8 individual vec4 uniforms.
    const u = this.injectMesh.program.uniforms;
    for (let i = 0; i < POINTER_COUNT; i++) {
      const b = i * 4;
      (u["uTouch" + i].value as Float32Array).set([
        this.touch[b],
        this.touch[b + 1],
        this.touch[b + 2],
        this.touch[b + 3],
      ]);
    }
  }

  private updateRunState(): void {
    if (this.mounted && this.visible && this.inView) this.play();
    else this.pause();
  }

  private play(): void {
    if (this.raf) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private pause(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = (now: number): void => {
    const dt = Math.min((now - this.lastFrame) / 1000, 1 / 30);
    this.lastFrame = now;
    this.time += dt;
    this.step();
    this.raf = requestAnimationFrame(this.loop);
  };

  private blit(mesh: Mesh, target: RenderTarget | null): void {
    this.renderer!.render({ scene: mesh, target: target ?? undefined });
  }

  private step(): void {
    if (!this.renderer) return;
    this.updatePointers();

    // 1. Inject forces from the pointers.
    this.injectMesh.program.uniforms.tField.value = this.field.read.texture;
    this.injectMesh.program.uniforms.uTime.value = this.time;
    this.injectMesh.program.uniforms.uAspect.value = this.aspect;
    this.blit(this.injectMesh, this.field.write);
    this.field.swap();

    // 2. Advect (near-inviscid self-advection + a touch of viscosity).
    this.advectMesh.program.uniforms.tField.value = this.field.read.texture;
    this.blit(this.advectMesh, this.field.write);
    this.field.swap();

    // 2b. Vorticity confinement: feed the eaten swirl back into the velocity.
    this.vorticityMesh.program.uniforms.tField.value = this.field.read.texture;
    this.blit(this.vorticityMesh, this.field.write);
    this.field.swap();

    // 3. Divergence of the velocity field.
    this.divergenceMesh.program.uniforms.tField.value = this.field.read.texture;
    this.blit(this.divergenceMesh, this.divergence);

    // 4. Pressure solve (Jacobi, 10 iterations).
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      this.pressureMesh.program.uniforms.tPressure.value = this.pressure.read.texture;
      this.pressureMesh.program.uniforms.tDivergence.value = this.divergence.texture;
      this.blit(this.pressureMesh, this.pressure.write);
      this.pressure.swap();
    }

    // 5. Projection: subtract the pressure gradient (incompressible).
    this.projectMesh.program.uniforms.tField.value = this.field.read.texture;
    this.projectMesh.program.uniforms.tPressure.value = this.pressure.read.texture;
    this.blit(this.projectMesh, this.field.write);
    this.field.swap();

    // 5b. Advance the dye ("fluid memory"): carry it with the flow, dissolve it
    // slowly, and deposit fresh silk where the flow is energetic.
    this.dyeMesh.program.uniforms.tDye.value = this.dye.read.texture;
    this.dyeMesh.program.uniforms.tField.value = this.field.read.texture;
    this.dyeMesh.program.uniforms.tMap.value = this.tMap;
    this.blit(this.dyeMesh, this.dye.write);
    this.dye.swap();

    // 6. Display to screen.
    this.displayMesh.program.uniforms.tField.value = this.field.read.texture;
    this.displayMesh.program.uniforms.tDye.value = this.dye.read.texture;
    this.displayMesh.program.uniforms.tMap.value = this.tMap;
    this.displayMesh.program.uniforms.uTime.value = this.time;
    this.displayMesh.program.uniforms.uCalm.value = this.calm;
    this.blit(this.displayMesh, null);
  }
}
