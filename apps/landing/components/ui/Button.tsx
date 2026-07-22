import { cn } from '@/lib/cn';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'solid' | 'ghost';
type Size = 'sm' | 'md';

// Transitions name their properties (never `all`) and stay inside the 120-150ms
// band the brand uses for micro feedback.
const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,border-color,filter] duration-150 ease-out focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
    solid: 'bg-accent font-semibold text-canvas hover:brightness-[1.08]',
    ghost: 'border border-line text-fg hover:bg-surface-2',
};

const sizes: Record<Size, string> = {
    sm: 'rounded-[9px] px-4 py-[9px] text-sm',
    md: 'rounded-[10px] px-[22px] py-[13px] text-[15px]',
};

interface CommonProps {
    variant?: Variant;
    size?: Size;
    className?: string;
    children: ReactNode;
}

type AnchorProps = CommonProps & { href: string } & Omit<
        AnchorHTMLAttributes<HTMLAnchorElement>,
        'className' | 'href' | 'children'
    >;

type NativeButtonProps = CommonProps & { href?: undefined } & Omit<
        ButtonHTMLAttributes<HTMLButtonElement>,
        'className' | 'children'
    >;

export function Button(props: AnchorProps | NativeButtonProps) {
    const { variant = 'solid', size = 'sm', className, children } = props;
    const classes = cn(base, variants[variant], sizes[size], className);

    if (props.href !== undefined) {
        const { variant: _v, size: _s, className: _c, children: _ch, ...rest } = props;
        return (
            <a className={classes} {...rest}>
                {children}
            </a>
        );
    }

    const { variant: _v, size: _s, className: _c, children: _ch, href: _h, ...rest } = props;
    return (
        <button className={classes} {...rest}>
            {children}
        </button>
    );
}

/** The trailing arrow on primary CTAs. Mono so it keeps its weight beside Fira Sans. */
export function ButtonArrow() {
    return (
        <span aria-hidden="true" className="font-mono">
            →
        </span>
    );
}
