import CmsShell from '../../../cms-shell';
import DomainModulePage from '../../../domains/domains-page';

export default async function DomainsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<{ siteId?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const query = searchParams ? await searchParams : {};
  void (Array.isArray(query.siteId) ? query.siteId[0] : query.siteId);
  return (
    <CmsShell workspaceId={workspaceId}>
      <DomainModulePage />
    </CmsShell>
  );
}
