import CmsShell from '../../../cms-shell';
import { AnalyticsView } from '../../../analytics/analytics-view';

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <AnalyticsView workspaceId={workspaceId} />
    </CmsShell>
  );
}
