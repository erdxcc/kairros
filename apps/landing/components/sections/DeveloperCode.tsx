'use client';

import { Reveal } from '@/components/effects/Reveal';
import { CheckList } from '@/components/ui/CheckList';
import { Eyebrow, Pill } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';
import { type CodeTab, checkout } from '@/lib/copy';
import { site } from '@/lib/site';
import { useState } from 'react';

// Highlighting two fixed snippets does not need a tokenizer: they are authored
// here as spans, so what ships is exactly what we wrote.
const kw = 'text-accent-kw';
const str = 'text-success';
const fn = 'text-fg';
const comment = 'text-fainter';

const SNIPPETS: Record<CodeTab, React.ReactNode> = {
    checkout: (
        <>
            <span className={comment}>{'// Subscribe-with-Solana button'}</span>
            {'\n'}
            <span className={kw}>import</span>
            {' { KairosCheckout } '}
            <span className={kw}>from</span> <span className={str}>"@kairos/sdk"</span>;{'\n\n'}
            {'KairosCheckout.'}
            <span className={fn}>mount</span>(<span className={str}>"#subscribe"</span>
            {', {\n  plan: '}
            <span className={str}>"plan_9f3a2c"</span>
            {',\n  network: '}
            <span className={str}>"{site.network}"</span>
            {',\n  onSuccess: (sub) => unlock(sub.id),\n});'}
        </>
    ),
    webhook: (
        <>
            <span className={comment}>{'// Verify a signed event, then react'}</span>
            {'\n'}
            <span className={kw}>import</span>
            {' { verifyWebhook } '}
            <span className={kw}>from</span> <span className={str}>"@kairos/sdk"</span>;{'\n\n'}
            {'app.'}
            <span className={fn}>post</span>(<span className={str}>"/webhooks/kairos"</span>
            {', (req, res) => {\n  '}
            <span className={kw}>const</span>
            {' event = '}
            <span className={fn}>verifyWebhook</span>
            {'(req, SECRET);\n  '}
            <span className={kw}>if</span>
            {' (event.type === '}
            <span className={str}>"charge.succeeded"</span>
            {') {\n    unlock(event.data.subscriber);\n  }\n  res.'}
            <span className={fn}>sendStatus</span>
            {'(200);\n});'}
        </>
    ),
};

/**
 * The drop-in checkout pitch, tagged `preview` because the SDK is designed but
 * not shipped. The snippets illustrate the intended surface, so they have to
 * move whenever it does.
 */
export function DeveloperCode() {
    const [tab, setTab] = useState<CodeTab>('checkout');

    return (
        <section id="build" className="container-page section">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-center gap-11">
                <div>
                    <Reveal>
                        <Eyebrow badge={<Pill>{checkout.badge}</Pill>}>{checkout.eyebrow}</Eyebrow>
                    </Reveal>
                    <Reveal delay={80}>
                        <h2 className="mt-5 text-[clamp(28px,3.6vw,44px)] font-semibold leading-[1.07] tracking-[-0.026em]">
                            {checkout.heading}
                        </h2>
                    </Reveal>
                    <Reveal delay={140}>
                        <p className="mt-[22px] max-w-[42ch] text-[17px] leading-relaxed text-muted">
                            {checkout.lead}
                        </p>
                    </Reveal>
                    <Reveal delay={200}>
                        <CheckList items={checkout.points} className="mt-7" />
                    </Reveal>
                </div>

                <Reveal delay={120}>
                    <div className="overflow-hidden rounded-[14px] border border-line bg-code shadow-[0_30px_70px_-30px_rgba(0,0,0,0.7)]">
                        <div className="flex items-center justify-between border-b border-line-soft bg-chrome pr-1.5">
                            <div className="flex" role="tablist" aria-label="SDK examples">
                                {checkout.tabs.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        role="tab"
                                        id={`code-tab-${t.id}`}
                                        aria-selected={tab === t.id}
                                        aria-controls={`code-panel-${t.id}`}
                                        onClick={() => setTab(t.id)}
                                        className={cn(
                                            'border-b-2 px-4 py-3.5 font-mono text-[12.5px] transition-colors duration-150',
                                            tab === t.id
                                                ? 'border-accent text-fg'
                                                : 'border-transparent text-faint hover:text-fg-soft',
                                        )}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <span className="hidden pr-3 font-mono text-[11px] text-fainter sm:block">
                                {checkout.install}
                            </span>
                        </div>

                        <pre
                            role="tabpanel"
                            id={`code-panel-${tab}`}
                            aria-labelledby={`code-tab-${tab}`}
                            className="m-0 overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.72] text-muted"
                        >
                            <code>{SNIPPETS[tab]}</code>
                        </pre>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
