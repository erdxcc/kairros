import type { ReactNode } from 'react';

export const metadata = {
    title: 'kairos',
    description: 'Open-source merchant billing layer for the native Solana Subscriptions program.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
