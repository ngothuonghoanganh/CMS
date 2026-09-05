import CmsShell from '../../../../../../../cms-shell';
import SeoPage from '../../../../../../../seo/seo-page';

export default async function PageSeoRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; siteId: string; pageId: string }>;
}) {
  const { pageId, siteId, workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SeoPage pageId={pageId} siteId={siteId} />
    </CmsShell>
  );
}
