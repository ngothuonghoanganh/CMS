import AssetModulePage from '../../../../assets/assets-page';

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; assetId: string }>;
}) {
  const { assetId } = await params;
  return <AssetModulePage action="edit" assetId={assetId} />;
}
