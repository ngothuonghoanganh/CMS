import { IntegrationsView } from '../../../integrations/integrations-view';

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <IntegrationsView workspaceId={workspaceId} />;
}
