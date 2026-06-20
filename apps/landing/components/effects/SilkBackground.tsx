"use client";

import { useEffect, useRef, useState } from "react";
import { SilkField } from "@/lib/silk/SilkField";
import { shouldReduceMotion } from "@/lib/useReducedMotion";
import { cn } from "@/lib/cn";

const MOBILE_BREAKPOINT = 768;

export interface SilkBackgroundProps {
  className?: string;
  /** Optional external pause control (e.g. while a modal is open). */
  paused?: boolean;
  palette?: string[];
}

/**
 * Client wrapper around the framework-agnostic {@link SilkField}.
 *
 * Always paints a static gradient fallback underneath; mounts the WebGL field
 * on top only when supported and motion is allowed (>=768px, WebGL2 +
 * EXT_color_buffer_float, no reduced-motion / Save-Data). Pauses offscreen and
 * when the tab is hidden; tears down all GL resources on unmount.
 */
export function SilkBackground({
  className,
  paused,
  palette,
}: SilkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<SilkField | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (shouldReduceMotion() || window.innerWidth < MOBILE_BREAKPOINT) return;

    const field = new SilkField();
    const ok = field.mount(canvas, palette ? { palette } : {});
    if (!ok) {
      field.destroy();
      return;
    }
    fieldRef.current = field;
    setRunning(true);

    let resizeTimer = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => field.resize(), 150);
    });
    resizeObserver.observe(canvas);

    const inViewObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) field.setInView(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    inViewObserver.observe(canvas);

    return () => {
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      inViewObserver.disconnect();
      field.destroy();
      fieldRef.current = null;
      setRunning(false);
    };
  }, [palette]);

  // External pause control overrides the in-view state when provided.
  useEffect(() => {
    if (paused === undefined) return;
    fieldRef.current?.setInView(!paused);
  }, [paused]);

  return (
    <div className={cn("pointer-events-auto", className)} aria-hidden="true">
      <div className="silk-fallback absolute inset-0" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full transition-opacity duration-700"
        style={{ opacity: running ? 1 : 0 }}
      />
    </div>
  );
}
