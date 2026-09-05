import CmsShell from '../../../../../cms-shell';
import DesignSystemPage from '../../../../../design-system/design-system-page';

export default async function SiteDesignSystemPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <DesignSystemPage siteId={siteId} />
    </CmsShell>
  );
}
