import { Logo } from "@/components/ui/Logo";
import { footer } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container-page py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-faint">
              The billing layer for Solana. Non-custodial, settled in seconds.
            </p>
          </div>

          {footer.columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3 className="text-sm font-semibold text-fg">{column.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-fg-muted transition hover:text-fg"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 hairline" />

        <div className="mt-6 flex flex-col items-start justify-between gap-4 text-sm text-fg-faint sm:flex-row sm:items-center">
          <p>{footer.copyright}</p>
          <div className="flex items-center gap-5">
            {footer.legal.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="transition hover:text-fg"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
