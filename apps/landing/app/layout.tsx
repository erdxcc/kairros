import { GrainOverlay } from '@/components/effects/GrainOverlay';
import { site } from '@/lib/site';
import type { Metadata, Viewport } from 'next';
import { Fira_Code, Fira_Sans } from 'next/font/google';
import './globals.css';

// Fira Sans for UI, Fira Code for numbers/addresses/code: the same pairing the
// dashboard uses, so both surfaces read as one product. Self-hosted by
// next/font, so there is no runtime request to Google.
const firaSans = Fira_Sans({
    subsets: ['latin'],
    weight: ['300', '400', '500', '600', '700'],
    variable: '--font-fira-sans',
    display: 'swap',
});

const firaCode = Fira_Code({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-fira-code',
    display: 'swap',
});

export const metadata: Metadata = {
    metadataBase: new URL(site.url),
    title: {
        default: `${site.name}: Subscriptions and allowances, settled on-chain`,
        template: `%s: ${site.name}`,
    },
    description: site.description,
    keywords: [...site.keywords],
    applicationName: site.name,
    authors: [{ name: site.name }],
    alternates: { canonical: '/' },
    openGraph: {
        type: 'website',
        url: site.url,
        siteName: site.name,
        title: `${site.name}: The billing layer for Solana`,
        description: site.description,
    },
    twitter: {
        card: 'summary_large_image',
        title: `${site.name}: The billing layer for Solana`,
        description: site.description,
        creator: site.twitter,
    },
    robots: {
        index: true,
        follow: true,
    },
};

export const viewport: Viewport = {
    themeColor: '#0a0a0e',
    colorScheme: 'dark',
    width: 'device-width',
    initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`} suppressHydrationWarning>
            <body className="min-h-screen antialiased">
                {children}
                <GrainOverlay />
            </body>
        </html>
    );
}
