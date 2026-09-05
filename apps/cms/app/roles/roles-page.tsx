'use client';

import { RoleListResponseSchema, type Role } from '@payload/contracts';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { RolesView } from './roles-view';

export default function RolesPage() {
  const { session, workspaceId, can } = useCmsShell();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await api.get('/roles');
      setRoles(RoleListResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(message(caughtError));
    }
  }
  useEffect(() => {
    void load();
  }, [workspaceId]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <div aria-busy={busy} className="feature-page">
        <RolesView
          canAssign={can('role.assign')}
          canManage={can('role.create') && can('role.update')}
          currentUserId={session.user.email}
          onAssign={(input) =>
            void action(async () => {
              await api.post('/role-assignments', input);
            })
          }
          onCreate={(input) =>
            void action(async () => {
              await api.post('/roles', input);
            })
          }
          onUpdate={(roleId, input) =>
            void action(async () => {
              await api.patch(`/roles/${roleId}`, input);
            })
          }
          roles={roles}
          workspaceId={workspaceId}
        />
      </div>
    </>
  );
}
function message(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load roles.';
}
