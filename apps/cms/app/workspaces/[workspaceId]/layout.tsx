import WorkspaceLayoutBoundary from './workspace-layout-boundary';

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;

  return (
    <WorkspaceLayoutBoundary workspaceId={workspaceId}>
      {children}
    </WorkspaceLayoutBoundary>
  );
}
