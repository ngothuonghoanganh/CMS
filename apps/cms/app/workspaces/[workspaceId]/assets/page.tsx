import CmsShell from '../../../cms-shell';
import AssetModulePage from '../../../assets/assets-page';

export default async function AssetsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <CmsShell workspaceId={workspaceId}>
      <AssetModulePage />
    </CmsShell>
  );
}
