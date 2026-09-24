import DomainsPage from '../../../../../domains/domains-page';

export default async function SiteDomainsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  return <DomainsPage siteId={siteId} />;
}
