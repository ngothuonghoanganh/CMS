import { notFound } from 'next/navigation';

import LayoutBuilderShell from '../../../../../../../builder/layout-builder-shell';

type LayoutBuilderPageProps = {
  params: Promise<{
    workspaceId: string;
    kind: string;
    layoutId: string;
  }>;
};

export default async function WorkspaceLayoutBuilderPage({
  params,
}: LayoutBuilderPageProps) {
  const { workspaceId, kind, layoutId } = await params;
  if (kind !== 'headers' && kind !== 'footers') notFound();
  return (
    <LayoutBuilderShell layoutId={layoutId} layoutKind={kind} workspaceId={workspaceId} />
  );
}
