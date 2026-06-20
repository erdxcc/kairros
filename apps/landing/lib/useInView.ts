"use client";

import { useEffect, useRef, useState } from "react";

export interface UseInViewOptions {
  /** Stop observing after the first intersection. Defaults to true. */
  once?: boolean;
  rootMargin?: string;
  threshold?: number | number[];
}

/**
 * Lightweight IntersectionObserver hook. Returns a ref to attach and a boolean
 * that flips true while the element is in view. Used for reveal-on-scroll,
 * lazy media gating, and the sticky "How it works" active step.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  const { once = true, rootMargin = "0px 0px -10% 0px", threshold = 0 } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IO support → reveal immediately so content is never hidden.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, inView };
}
