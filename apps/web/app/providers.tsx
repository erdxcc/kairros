'use client';

import { AuthProvider } from '@/lib/auth-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

/** Client-side providers: data cache + the merchant session context. */
export function Providers({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
                },
            }),
    );
    return (
        <QueryClientProvider client={client}>
            <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
    );
}
