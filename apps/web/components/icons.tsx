/** Inline stroke icons — no icon dependency, crisp at any size. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            {children}
        </svg>
    );
}

export const OverviewIcon = (p: IconProps) => (
    <Base {...p}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Base>
);

export const PlansIcon = (p: IconProps) => (
    <Base {...p}>
        <path d="M12 3 3 8l9 5 9-5-9-5Z" />
        <path d="m3 13 9 5 9-5" />
        <path d="m3 18 9 5 9-5" />
    </Base>
);

export const SubscribersIcon = (p: IconProps) => (
    <Base {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Base>
);

export const PaymentsIcon = (p: IconProps) => (
    <Base {...p}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
    </Base>
);

export const SettingsIcon = (p: IconProps) => (
    <Base {...p}>
        <path d="M4 21v-7" />
        <path d="M4 10V3" />
        <path d="M12 21v-9" />
        <path d="M12 8V3" />
        <path d="M20 21v-5" />
        <path d="M20 12V3" />
        <path d="M1 14h6" />
        <path d="M9 8h6" />
        <path d="M17 16h6" />
    </Base>
);

export const ExternalLinkIcon = (p: IconProps) => (
    <Base width="16" height="16" {...p}>
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Base>
);

export const CopyIcon = (p: IconProps) => (
    <Base width="16" height="16" {...p}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Base>
);

export const CheckIcon = (p: IconProps) => (
    <Base {...p}>
        <path d="M20 6 9 17l-5-5" />
    </Base>
);

export const LogOutIcon = (p: IconProps) => (
    <Base width="16" height="16" {...p}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
    </Base>
);

export const WalletIcon = (p: IconProps) => (
    <Base {...p}>
        <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
        <path d="M18 12a1 1 0 0 0 0 2h3v-2Z" />
    </Base>
);

export const PlusIcon = (p: IconProps) => (
    <Base width="16" height="16" {...p}>
        <path d="M5 12h14" />
        <path d="M12 5v14" />
    </Base>
);

/** kairos mark: a stylized hourglass / "opportune moment". */
export const Logo = (p: IconProps) => (
    <Base strokeWidth="1.6" {...p}>
        <path d="M6 3h12" />
        <path d="M6 21h12" />
        <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
        <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
    </Base>
);
