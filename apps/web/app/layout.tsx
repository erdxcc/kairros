import { Fira_Code, Fira_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

// Fira Sans for UI, Fira Code for numbers/addresses — a typeface pairing tuned
// for data dashboards. Self-hosted by next/font (no runtime request to Google).
const firaSans = Fira_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-fira-sans',
    display: 'swap',
});
const firaCode = Fira_Code({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    variable: '--font-fira-code',
    display: 'swap',
});

export const metadata = {
    title: 'kairos — merchant dashboard',
    description: 'Open-source merchant billing layer for the native Solana Subscriptions program.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
