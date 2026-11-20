import { TabsNav } from '@plp/ui';
import Link from 'next/link';
import { billingHref, paymentsHref } from '../shell/navigation';

export interface BillingTabsProps {
  workspaceId: string;
  current: 'plan' | 'payments';
}

/** The two tabs under "Gói dịch vụ": board 28 "Gói & mức dùng" and board 29 "Thanh toán & hóa đơn". */
export function BillingTabs({ workspaceId, current }: BillingTabsProps) {
  return (
    <TabsNav
      aria-label="Gói và thanh toán"
      as={Link}
      items={[
        { href: billingHref(workspaceId), label: 'Gói & mức dùng', current: current === 'plan' },
        {
          href: paymentsHref(workspaceId),
          label: 'Thanh toán & hóa đơn',
          current: current === 'payments',
        },
      ]}
    />
  );
}
