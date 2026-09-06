import { redirect } from 'next/navigation';
import { cmsViewPath } from '../../../../../cms-routes';

export default async function SiteNavigationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { workspaceId, siteId } = await params;
  redirect(cmsViewPath(workspaceId, 'design-system', siteId));
}
