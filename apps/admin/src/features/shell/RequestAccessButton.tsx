'use client';

import type { Access } from '@plp/contracts';
import { Button } from '@plp/ui';
import { useState } from 'react';
import { AccessRequestDialog } from '../members/AccessRequestDialog';

/** "Yêu cầu đổi quyền" from a screen the role may not open (ADR-021). */
export function RequestAccessButton({
  workspaceId,
  role,
  siteLimited,
}: {
  workspaceId: string;
  role: Access;
  siteLimited: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Yêu cầu đổi quyền
      </Button>
      <AccessRequestDialog
        workspaceId={workspaceId}
        role={role}
        siteLimited={siteLimited}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
