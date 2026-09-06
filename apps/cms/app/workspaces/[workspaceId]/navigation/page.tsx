import { redirect } from 'next/navigation';
import { cmsViewPath } from '../../../cms-routes';

export default async function WorkspaceNavigationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(cmsViewPath(workspaceId, 'design-system'));
}
