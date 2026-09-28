'use client';

import type { ReactNode } from 'react';

import CmsShell from '../../cms-shell';
import { isStandaloneWorkspaceRoute } from '../../cms-routes';
import { CmsPageTransition } from '../../ui/page-transition';
import { useCmsTheme } from '../../ui/theme-provider';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';

const AdminAntdProvider = dynamic(() =>
  import('../../../src/design-system/admin-antd-provider').then(
    (module) => module.AdminAntdProvider,
  ),
);

export default function WorkspaceLayoutBoundary({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const pathname = usePathname();
  const { preference } = useCmsTheme();

  if (isStandaloneWorkspaceRoute(pathname)) return <>{children}</>;

  return (
    <AdminAntdProvider preference={preference}>
      <CmsShell workspaceId={workspaceId}>
        <CmsPageTransition>{children}</CmsPageTransition>
      </CmsShell>
    </AdminAntdProvider>
  );
}
