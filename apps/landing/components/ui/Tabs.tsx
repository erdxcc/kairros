"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /** Used to build tab/panel ids: `${idBase}-tab-${id}` / `${idBase}-panel-${id}`. */
  idBase: string;
  label: string;
  className?: string;
  size?: "sm" | "md";
  /** "pill" wraps the strip in a bordered container; "plain" is bare. */
  variant?: "pill" | "plain";
}

/**
 * Accessible tablist primitive (roles, arrow-key navigation, roving tabindex).
 * Renders only the tab strip; callers render the matching tabpanels and wire
 * `id={`${idBase}-panel-${id}`}` + `aria-labelledby`.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  idBase,
  label,
  className,
  size = "md",
  variant = "pill",
}: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value);
    if (current === -1) return;
    let next = current;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (current + 1) % items.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const target = items[next];
    if (target) {
      onValueChange(target.id);
      focusTab(next);
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex flex-wrap gap-1",
        variant === "pill" &&
          "rounded-full border border-border bg-surface/70 p-1 backdrop-blur",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`${idBase}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.id)}
            className={cn(
              "rounded-full font-medium tracking-tight transition duration-200",
              size === "sm" ? "px-3.5 py-1.5 text-[13px]" : "px-4 py-2 text-sm",
              selected
                ? "bg-surface-2 text-fg shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
