import CmsShell from '../../../../../cms-shell';
import SeoPage from '../../../../../seo/seo-page';

export default async function SiteSeoPage({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string }>;
}) {
  const { siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SeoPage siteId={siteId} />
    </CmsShell>
  );
}
