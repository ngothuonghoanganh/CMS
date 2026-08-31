import BuilderShell from '../../../../../../../../builder/builder-shell';

type BuilderPageProps = {
  params: Promise<{
    workspaceId: string;
    siteId: string;
    pageId: string;
  }>;
  searchParams?: Promise<{ reusableId?: string | string[] }>;
};

export default async function BuilderPage({ params, searchParams }: BuilderPageProps) {
  const { workspaceId, siteId, pageId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const reusableId = resolvedSearchParams?.reusableId;
  return (
    <BuilderShell
      pageId={pageId}
      {...(typeof reusableId === 'string' ? { reusableId } : {})}
      siteId={siteId}
      workspaceId={workspaceId}
    />
  );
}
