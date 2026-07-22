import { Reveal } from '@/components/effects/Reveal';
import { NetworkBadge } from '@/components/ui/NetworkBadge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';
import { dashboard } from '@/lib/copy';
import { site } from '@/lib/site';

// Chart geometry. The viewBox is stretched with preserveAspectRatio="none", so
// the curve fills whatever width the card ends up at.
const CHART_W = 620;
const CHART_H = 190;
const CHART_PAD = 6;

/** Build the line and the area beneath it from the revenue series. */
function chartPaths(data: readonly number[]): { line: string; area: string } {
    const n = data.length;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const x = (i: number) => CHART_PAD + (i * (CHART_W - 2 * CHART_PAD)) / (n - 1);
    const y = (v: number) => CHART_H - 12 - ((v - min) / (max - min)) * (CHART_H - 34);

    const points = data.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p}`).join(' ');
    const area = `M${x(0).toFixed(1)} ${CHART_H} ${points.map((p) => `L${p}`).join(' ')} L${x(n - 1).toFixed(1)} ${CHART_H} Z`;

    return { line, area };
}

/**
 * A static picture of the merchant dashboard. The numbers are illustrative, not
 * live: this is the marketing site, and wiring it to real data would be a
 * promise the page has to keep on every load.
 */
export function DashboardMockup() {
    const { line, area } = chartPaths(dashboard.chart.data);

    return (
        <section
            id="product"
            className="border-t border-line-soft bg-canvas-alt bg-[radial-gradient(90%_70%_at_50%_0%,rgba(124,108,255,0.06),transparent_60%)]"
        >
            <div className="container-page section">
                <SectionHeader
                    eyebrow={dashboard.eyebrow}
                    heading={dashboard.heading}
                    lead={dashboard.lead}
                    className="mb-12"
                />

                <Reveal delay={120}>
                    <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]">
                        {/* Window chrome */}
                        <div className="flex items-center gap-3.5 border-b border-line-soft bg-chrome px-[18px] py-[13px]">
                            <div aria-hidden="true" className="flex flex-none gap-[7px]">
                                <span className="size-[11px] rounded-full bg-dot" />
                                <span className="size-[11px] rounded-full bg-dot" />
                                <span className="size-[11px] rounded-full bg-dot" />
                            </div>
                            <div className="flex flex-1 justify-center">
                                <span className="truncate rounded-[7px] border border-line-soft bg-canvas-alt px-3.5 py-1 font-mono text-xs text-fainter">
                                    {dashboard.url}
                                </span>
                            </div>
                            <div className="flex flex-none items-center gap-2.5">
                                <NetworkBadge
                                    network={site.network}
                                    pulse={false}
                                    className="hidden sm:inline-flex"
                                />
                                <span
                                    aria-hidden="true"
                                    className="size-6 rounded-full bg-gradient-to-br from-accent to-success"
                                />
                            </div>
                        </div>

                        <div className="flex min-h-[440px]">
                            {/* Sidebar: hidden on narrow screens, where it would crush the main panel */}
                            <aside className="hidden w-[198px] flex-none flex-col gap-[3px] border-r border-line-soft bg-chrome px-3 py-[18px] md:flex">
                                {dashboard.sidebar.map((item, i) => (
                                    <div
                                        key={item}
                                        className={cn(
                                            'relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px]',
                                            i === 0 ? 'bg-accent/10 font-medium text-fg' : 'text-faint',
                                        )}
                                    >
                                        {i === 0 && (
                                            <span
                                                aria-hidden="true"
                                                className="absolute inset-y-2 left-0 w-[2.5px] rounded-sm bg-accent"
                                            />
                                        )}
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                'size-1.5 rounded-sm',
                                                i === 0 ? 'bg-accent' : 'bg-dot-2',
                                            )}
                                        />
                                        {item}
                                    </div>
                                ))}
                                <div className="mt-auto rounded-[10px] border border-line-soft bg-canvas-alt p-3">
                                    <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fainter">
                                        {dashboard.pullerKey.label}
                                    </p>
                                    <p className="font-mono text-[11.5px] text-muted">
                                        {dashboard.pullerKey.value}
                                    </p>
                                </div>
                            </aside>

                            {/* Main panel */}
                            <div className="min-w-0 flex-1 p-6">
                                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3">
                                    {dashboard.stats.map((stat) => (
                                        <div
                                            key={stat.label}
                                            className="rounded-xl border border-line-softer bg-nested px-[18px] py-4"
                                        >
                                            <p className="mb-2.5 text-xs text-faint">{stat.label}</p>
                                            <p className="tabular font-mono text-2xl tracking-[-0.01em] text-fg">
                                                {stat.value}
                                                {stat.suffix ? (
                                                    <span className="text-[15px] text-fainter">
                                                        {stat.suffix}
                                                    </span>
                                                ) : null}
                                            </p>
                                            <div className="mt-2 flex items-center gap-1.5">
                                                <span className="rounded-[5px] bg-success/10 px-1.5 py-0.5 font-mono text-[11px] text-success">
                                                    {stat.delta}
                                                </span>
                                                <span className="text-[11px] text-fainter">{stat.note}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Revenue chart */}
                                <div className="mt-3 rounded-xl border border-line-softer bg-nested p-[18px]">
                                    <div className="mb-3.5 flex items-center justify-between">
                                        <span className="text-[13px] font-medium text-fg-soft">
                                            {dashboard.chart.title}
                                        </span>
                                        <span className="font-mono text-[11px] text-fainter">
                                            {dashboard.chart.range}
                                        </span>
                                    </div>
                                    <svg
                                        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                                        preserveAspectRatio="none"
                                        className="block h-[130px] w-full"
                                        role="img"
                                        aria-label={`${dashboard.chart.title}, ${dashboard.chart.range}`}
                                    >
                                        <defs>
                                            <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
                                                <stop
                                                    offset="0%"
                                                    stopColor="var(--color-accent)"
                                                    stopOpacity="0.28"
                                                />
                                                <stop
                                                    offset="100%"
                                                    stopColor="var(--color-accent)"
                                                    stopOpacity="0"
                                                />
                                            </linearGradient>
                                        </defs>
                                        <path d={area} fill="url(#revenue-fill)" />
                                        <path
                                            d={line}
                                            fill="none"
                                            stroke="var(--color-accent)"
                                            strokeWidth="2"
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </div>

                                {/* Recent payments */}
                                <div className="mt-3 overflow-hidden rounded-xl border border-line-softer bg-nested">
                                    <div className="flex items-center justify-between border-b border-surface-2 px-4 py-3">
                                        <span className="text-[13px] font-medium text-fg-soft">
                                            {dashboard.payments.title}
                                        </span>
                                        <span className="font-mono text-[11px] text-accent">
                                            {dashboard.payments.viewAll}
                                        </span>
                                    </div>
                                    {dashboard.payments.rows.map((row, i) => (
                                        <div
                                            key={row.address}
                                            className={cn(
                                                'flex items-center justify-between gap-3 px-4 py-3',
                                                i < dashboard.payments.rows.length - 1 &&
                                                    'border-b border-surface-3',
                                            )}
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="font-mono text-[12.5px] text-fg-soft">
                                                    {row.address}
                                                </span>
                                                <span className="truncate text-xs text-fainter">
                                                    {row.plan}
                                                </span>
                                            </div>
                                            <div className="flex flex-none items-center gap-3.5">
                                                <span className="tabular font-mono text-[12.5px] text-fg">
                                                    {row.amount}
                                                </span>
                                                <span
                                                    className={cn(
                                                        'rounded-[5px] px-1.5 py-0.5 font-mono text-[10.5px]',
                                                        row.status === 'succeeded'
                                                            ? 'bg-success/10 text-success'
                                                            : 'bg-warning/10 text-warning',
                                                    )}
                                                >
                                                    {row.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
