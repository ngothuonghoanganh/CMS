import CmsShell from '../../../../cms-shell';
import AssetsPage from '../../../../assets/assets-page';

export default async function NewAssetPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <AssetsPage action="create" />
    </CmsShell>
  );
}
