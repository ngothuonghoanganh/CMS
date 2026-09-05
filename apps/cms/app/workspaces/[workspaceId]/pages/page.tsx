import CmsShell from '../../../cms-shell';
import PagesPage from '../../../pages/pages-page';

export default async function WorkspacePagesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <PagesPage />
    </CmsShell>
  );
}
