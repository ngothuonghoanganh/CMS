import CmsShell from '../../cms-shell';
import { CmsPageTransition } from '../../ui/page-transition';

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;

  return (
    <CmsShell workspaceId={workspaceId}>
      <CmsPageTransition>{children}</CmsPageTransition>
    </CmsShell>
  );
}
