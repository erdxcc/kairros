"use client";

import { Fragment, useState } from "react";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { tokenize, type TokenType } from "@/lib/highlight";

const TOKEN_CLASS: Record<TokenType, string> = {
  keyword: "text-accent",
  string: "text-accent-3",
  comment: "text-fg-faint italic",
  number: "text-accent-2",
  function: "text-accent-2",
  type: "text-[#c4b5fd]",
  property: "text-fg",
  punctuation: "text-fg-muted",
  plain: "text-fg",
};

export interface CodeTab {
  id: string;
  label: string;
  code: string;
}

export function CodeBlock({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const [copied, setCopied] = useState(false);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const items: TabItem[] = tabs.map((tab) => ({ id: tab.id, label: tab.label }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently ignore.
    }
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-[#0b0b12] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <Tabs
          items={items}
          value={active}
          onValueChange={setActive}
          idBase="code"
          label="Code examples"
          size="sm"
          variant="plain"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md px-2.5 py-1.5 font-mono text-xs text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          aria-label={copied ? "Copied to clipboard" : "Copy code"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`code-panel-${tab.id}`}
          aria-labelledby={`code-tab-${tab.id}`}
          hidden={tab.id !== active}
        >
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
            <code>
              {tokenize(tab.code).map((token, index) => (
                <Fragment key={index}>
                  <span className={TOKEN_CLASS[token.type]}>{token.text}</span>
                </Fragment>
              ))}
            </code>
          </pre>
        </div>
      ))}
    </div>
  );
}
