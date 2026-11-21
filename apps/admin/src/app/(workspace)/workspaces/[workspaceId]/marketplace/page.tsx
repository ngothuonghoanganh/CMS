import { endpoints } from '@plp/contracts';
import type { Metadata } from 'next';
import { loadWorkspaceContext } from '../../../../../features/shell/workspace-context';
import { MarketplaceScreen } from '../../../../../features/marketplace/MarketplaceScreen';
import { serverApi } from '../../../../../lib/server-api';

interface MarketplacePageProps {
  params: Promise<{ workspaceId: string }>;
}

export async function generateMetadata({ params }: MarketplacePageProps): Promise<Metadata> {
  const { membership } = await loadWorkspaceContext((await params).workspaceId);
  return { title: `Marketplace — ${membership.workspace.name}` };
}

/**
 * "Marketplace" (board 30, ADR-036): the catalog every member browses. Search, filters and the
 * sort stay on the screen.
 */
export default async function MarketplacePage({ params }: MarketplacePageProps) {
  const { workspaceId } = await params;
  const { membership, sites, site } = await loadWorkspaceContext(workspaceId);
  const catalog = await serverApi(endpoints.listMarketplace, [workspaceId]);
  return (
    <MarketplaceScreen
      workspace={membership.workspace}
      role={membership.role}
      catalog={catalog}
      aiSiteId={site?.id ?? sites[0]?.id ?? null}
    />
  );
}
