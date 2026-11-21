import { endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { OwnedItemsScreen } from '../../../../../../features/marketplace/OwnedItemsScreen';
import { loadWorkspaceContext } from '../../../../../../features/shell/workspace-context';
import { serverApi } from '../../../../../../lib/server-api';

interface OwnedPageProps {
  params: Promise<{ workspaceId: string }>;
}

export async function generateMetadata({ params }: OwnedPageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Sản phẩm đã mua — ${membership.workspace.name}` };
}

/**
 * "Sản phẩm đã mua" (board 32, ADR-036): the marketplace items the workspace holds a licence of,
 * newest first, with the update each one may take.
 */
export default async function OwnedPage({ params }: OwnedPageProps) {
  const { workspaceId } = await params;
  const { membership, sites, site } = await loadWorkspaceContext(workspaceId);
  const { items } = await serverApi(endpoints.listMarketplaceLicences, [workspaceId]);
  return (
    <OwnedItemsScreen
      workspace={membership.workspace}
      role={membership.role}
      items={items}
      sites={sites}
      initialSiteId={site?.id ?? null}
    />
  );
}
