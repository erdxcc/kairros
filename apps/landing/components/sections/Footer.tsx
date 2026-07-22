import { Logo } from '@/components/ui/Logo';
import { NetworkBadge } from '@/components/ui/NetworkBadge';
import { footer } from '@/lib/copy';
import { site } from '@/lib/site';

export function Footer() {
    return (
        <footer className="border-t border-line-soft bg-canvas">
            <div className="container-page grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-10 pb-10 pt-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
                <div className="min-w-[200px]">
                    <Logo className="mb-4" />
                    <p className="mb-4 max-w-[32ch] text-sm leading-relaxed text-faint">{footer.tagline}</p>
                    <NetworkBadge network={site.network} suffix={`· ${footer.stage}`} pulse={false} />
                </div>

                {footer.columns.map((column) => (
                    <nav key={column.heading} aria-label={column.heading}>
                        <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.1em] text-fainter">
                            {column.heading}
                        </h2>
                        <ul className="flex list-none flex-col gap-[11px] p-0">
                            {column.links.map((link) => (
                                <li key={link.label}>
                                    {'href' in link ? (
                                        <a
                                            href={link.href}
                                            className="text-sm text-muted transition-colors duration-150 hover:text-fg"
                                        >
                                            {link.label}
                                        </a>
                                    ) : (
                                        <span className="text-sm text-faint">{link.label}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </nav>
                ))}
            </div>

            <div className="border-t border-line-soft">
                <div className="container-page flex flex-wrap items-center justify-between gap-4 py-5">
                    <span className="font-mono text-xs text-fainter">{footer.copyright}</span>
                    <div className="flex gap-[22px]">
                        {footer.legal.map((link) => (
                            <span key={link.label} className="text-[13px] text-faint">
                                {link.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </footer>
    );
}
