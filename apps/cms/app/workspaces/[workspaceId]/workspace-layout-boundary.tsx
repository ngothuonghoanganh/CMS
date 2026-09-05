'use client';

import type { ReactNode } from 'react';

import CmsShell from '../../cms-shell';
import { isStandaloneWorkspaceRoute } from '../../cms-routes';
import { CmsPageTransition } from '../../ui/page-transition';
import { usePathname } from 'next/navigation';

export default function WorkspaceLayoutBoundary({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const pathname = usePathname();

  if (isStandaloneWorkspaceRoute(pathname)) return <>{children}</>;

  return (
    <CmsShell workspaceId={workspaceId}>
      <CmsPageTransition>{children}</CmsPageTransition>
    </CmsShell>
  );
}
