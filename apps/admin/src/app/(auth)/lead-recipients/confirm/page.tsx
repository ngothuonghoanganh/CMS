import type { Metadata } from 'next';
import { ConfirmRecipient } from '../../../../features/lead-recipients/ConfirmRecipient';
import { FormCard } from '../../../../features/shell/FormCard';

export const metadata: Metadata = {
  title: 'Xác nhận nhận lead',
  // The link carries a secret in its fragment; nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * The page a lead address's confirmation email links to (ADR-018). No session is needed: the
 * person who owns the address confirms it with a click, never by merely opening the link.
 */
export default function ConfirmRecipientPage() {
  return (
    <FormCard
      title="Xác nhận nhận lead"
      description="Sau khi xác nhận, địa chỉ này nhận một email mỗi khi có khách gửi form trên các trang của site."
    >
      <ConfirmRecipient />
    </FormCard>
  );
}
