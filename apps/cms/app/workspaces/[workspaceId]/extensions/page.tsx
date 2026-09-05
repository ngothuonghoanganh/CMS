import ExtensionModulePage from '../../../extensions/extensions-page';

export default async function ExtensionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ siteId?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const siteId = Array.isArray(query.siteId) ? query.siteId[0] : query.siteId;
  return <ExtensionModulePage {...(siteId ? { siteId } : {})} />;
}
