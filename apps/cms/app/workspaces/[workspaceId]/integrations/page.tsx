import CmsShell from '../../../cms-shell';
import { IntegrationsView } from '../../../integrations/integrations-view';

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <IntegrationsView workspaceId={workspaceId} />
    </CmsShell>
  );
}
