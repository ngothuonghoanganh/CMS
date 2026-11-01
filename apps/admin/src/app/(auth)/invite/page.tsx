import type { Metadata } from 'next';
import { InvitationPage } from '../../../features/members/InvitationPage';

export const metadata: Metadata = {
  title: 'Nhận lời mời vào workspace',
  // The link carries a secret in its fragment; nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * The page an invitation email links to (board 15b, ADR-021): no session needed to read it;
 * joining needs the invited email's account, made here or signed in.
 */
export default function InvitePage() {
  return <InvitationPage />;
}
