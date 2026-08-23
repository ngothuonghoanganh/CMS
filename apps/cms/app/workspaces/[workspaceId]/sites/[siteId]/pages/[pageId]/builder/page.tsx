import BuilderShell from '../../../../../../../../builder/builder-shell';

type BuilderPageProps = {
  params: Promise<{
    workspaceId: string;
    siteId: string;
    pageId: string;
  }>;
};

export default async function BuilderPage({ params }: BuilderPageProps) {
  const { workspaceId, siteId, pageId } = await params;
  return <BuilderShell pageId={pageId} siteId={siteId} workspaceId={workspaceId} />;
}
