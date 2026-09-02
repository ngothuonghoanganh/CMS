import { notFound } from 'next/navigation';

import LayoutBuilderShell from '../../../../../../../../../builder/layout-builder-shell';

type LayoutBuilderPageProps = {
  params: Promise<{
    workspaceId: string;
    siteId: string;
    kind: string;
    layoutId: string;
  }>;
};

export default async function LayoutBuilderPage({ params }: LayoutBuilderPageProps) {
  const { workspaceId, siteId, kind, layoutId } = await params;
  if (kind !== 'headers' && kind !== 'footers') notFound();
  return (
    <LayoutBuilderShell
      layoutId={layoutId}
      layoutKind={kind}
      siteId={siteId}
      workspaceId={workspaceId}
    />
  );
}
