import { METHOD_SETUP_RESULT_PARAM, methodSetupResultSchema } from '@plp/contracts';
import type { Metadata } from 'next';
import { loadMarketplaceItem } from '../../../../../../features/marketplace/load-marketplace';
import { MarketplaceItemScreen } from '../../../../../../features/marketplace/MarketplaceItemScreen';
import { loadWorkspaceContext } from '../../../../../../features/shell/workspace-context';

interface MarketplaceItemPageProps {
  params: Promise<{ workspaceId: string; itemId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function load({ params }: MarketplaceItemPageProps) {
  const { workspaceId, itemId } = await params;
  const context = await loadWorkspaceContext(workspaceId);
  const item = await loadMarketplaceItem(workspaceId, itemId);
  return { context, item };
}

export async function generateMetadata(props: MarketplaceItemPageProps): Promise<Metadata> {
  const { context, item } = await load(props);
  return { title: `${item.name} — Marketplace — ${context.membership.workspace.name}` };
}

/** One marketplace item (board 31, ADR-036). An unknown, draft or withdrawn item is a 404. */
export default async function MarketplaceItemPage(props: MarketplaceItemPageProps) {
  const { context, item } = await load(props);
  // The card page of the gateway leads back here with `?paymentMethod=saved|canceled`.
  const query = (await props.searchParams) ?? {};
  const returned = methodSetupResultSchema.safeParse(query[METHOD_SETUP_RESULT_PARAM]);
  return (
    <MarketplaceItemScreen
      workspace={context.membership.workspace}
      role={context.membership.role}
      item={item}
      returned={returned.success ? returned.data : null}
    />
  );
}
