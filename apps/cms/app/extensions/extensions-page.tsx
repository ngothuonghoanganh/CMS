'use client';

import { useCmsShell } from '../cms-shell';
import { ExtensionsView } from './extensions-view';

export default function ExtensionsPage({ siteId }: { siteId?: string }) {
  const { can, workspaceId } = useCmsShell();
  return (
    <ExtensionsView
      canManage={can('extensions.manage')}
      canManageLayouts={can('layout.create')}
      canDeleteLayouts={can('layout.delete')}
      workspaceId={workspaceId}
      {...(siteId ? { siteId } : {})}
    />
  );
}
