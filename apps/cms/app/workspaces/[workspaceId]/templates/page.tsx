import TemplateModulePage from '../../../templates/templates-page';

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ siteId?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const siteId = Array.isArray(query.siteId) ? query.siteId[0] : query.siteId;
  return <TemplateModulePage {...(siteId ? { siteId } : {})} />;
}
