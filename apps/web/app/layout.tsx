import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata = {
    title: 'kairos — merchant dashboard',
    description: 'Open-source merchant billing layer for the native Solana Subscriptions program.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
