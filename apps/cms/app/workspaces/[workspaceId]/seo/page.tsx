import CmsShell from '../../../cms-shell';
import SeoPage from '../../../seo/seo-page';

export default async function WorkspaceSeoPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <SeoPage />
    </CmsShell>
  );
}
