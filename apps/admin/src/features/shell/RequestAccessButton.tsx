'use client';

import type { Role } from '@plp/contracts';
import { Button } from '@plp/ui';
import { useState } from 'react';
import { AccessRequestDialog } from '../members/AccessRequestDialog';

/** "Yêu cầu đổi quyền" from a screen the role may not open (ADR-021). */
export function RequestAccessButton({ workspaceId, role }: { workspaceId: string; role: Role }) {
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
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
