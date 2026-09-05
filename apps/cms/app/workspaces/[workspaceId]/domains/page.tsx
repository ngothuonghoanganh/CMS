import DomainModulePage from '../../../domains/domains-page';

export default async function DomainsPage({
  searchParams,
}: {
  searchParams?: Promise<{ siteId?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  void (Array.isArray(query.siteId) ? query.siteId[0] : query.siteId);
  return <DomainModulePage />;
}
