import type { Metadata } from 'next';
import { connection } from 'next/server';
import { InvitationPage } from '../../../features/members/InvitationPage';
import { workspaceAddresses } from '../../../features/shell/current-address';

export const metadata: Metadata = {
  title: 'Nhận lời mời vào workspace',
  // The link carries a secret in its fragment; nothing here should be indexed.
  robots: { index: false, follow: false },
};

/**
 * The page an invitation email links to (board 15b, ADR-021): no session needed to read it;
 * joining needs the invited email's account, made here or signed in.
 */
export default async function InvitePage() {
  // Rendered per request: the address settings are read at run time, never baked in at build.
  await connection();
  return <InvitationPage addresses={workspaceAddresses()} />;
}
