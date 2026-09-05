import CmsShell from '../../../cms-shell';
import ExtensionModulePage from '../../../extensions/extensions-page';

export default async function ExtensionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ siteId?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const query = searchParams ? await searchParams : {};
  const siteId = Array.isArray(query.siteId) ? query.siteId[0] : query.siteId;
  return (
    <CmsShell workspaceId={workspaceId}>
      <ExtensionModulePage {...(siteId ? { siteId } : {})} />
    </CmsShell>
  );
}
