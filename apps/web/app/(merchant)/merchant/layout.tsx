import { AppShell } from '@/components/app-shell';
import type { ReactNode } from 'react';

/**
 * The merchant half of the dashboard. Same chrome as the payer pages; the
 * navigation switches on the path, so being here is what makes the merchant
 * links appear.
 *
 * The API is what actually guards this data: every merchant route runs
 * `requireMerchant`, so a wallet that owns no plan gets 403 whether or not it
 * finds its way to these URLs. Once merchant applications exist, this layout is
 * where a pending application should be turned away with an explanation.
 */
export default function MerchantLayout({ children }: { children: ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
