'use client';

import {
  RoleListResponseSchema,
  TenantUserDetailResponseSchema,
  TenantUserListResponseSchema,
  type Role,
  type TenantUserListItem,
  type TenantUserListQuery,
} from '@payload/contracts';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { UsersView } from './users-view';

export default function UsersPage() {
  const { session, workspaces, can } = useCmsShell();
  const [users, setUsers] = useState<TenantUserListItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [query, setQuery] = useState<Pick<TenantUserListQuery, 'search' | 'status'>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadUsers(input = query, offset = 0) {
    const params = new URLSearchParams({ limit: '20', offset: String(offset) });
    if (input.search) params.set('search', input.search);
    if (input.status) params.set('status', input.status);
    try {
      const response = TenantUserListResponseSchema.parse(
        await api.get(`/users?${params.toString()}`),
      );
      setUsers(response.items);
      setPagination(response.pagination);
      setQuery(input);
    } catch (caughtError) {
      setError(message(caughtError));
    }
  }
  useEffect(() => {
    void loadUsers();
    if (can('role.read'))
      void api
        .get('/roles')
        .then((response) => setRoles(RoleListResponseSchema.parse(response).items))
        .catch((caughtError: unknown) => setError(message(caughtError)));
  }, [can]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (caughtError) {
      setError(message(caughtError));
    } finally {
      setBusy(false);
    }
  }
  const reload = () => loadUsers(query, pagination.offset);
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <UsersView
        busy={busy}
        canAssign={can('role.assign')}
        canCreate={can('user.create')}
        canDisable={can('user.disable')}
        canRemove={can('user.remove')}
        canUpdate={can('user.update')}
        currentUserEmail={session.user.email}
        onAssign={(userId, input) =>
          action(async () => {
            await api.post(`/users/${userId}/role-assignments`, input);
          })
        }
        onCreate={(input) =>
          action(async () => {
            await api.post('/users', input);
            await loadUsers(query, 0);
          })
        }
        onLoadDetail={async (userId) => {
          try {
            return TenantUserDetailResponseSchema.parse(
              await api.get(`/users/${userId}`),
            );
          } catch (caughtError) {
            setError(message(caughtError));
            return null;
          }
        }}
        onPage={(offset) => void loadUsers(query, offset)}
        onRemove={(userId) =>
          action(async () => {
            await api.delete(`/users/${userId}`);
            await reload();
          })
        }
        onSearch={(input) => void loadUsers(input, 0)}
        onStatus={(userId, status) =>
          action(async () => {
            await api.post(
              `/users/${userId}/${status === 'active' ? 'enable' : 'disable'}`,
            );
            await reload();
          })
        }
        onUnassign={(userId, assignmentId) =>
          action(async () => {
            await api.delete(`/users/${userId}/role-assignments/${assignmentId}`);
          })
        }
        onUpdate={(userId, input) =>
          action(async () => {
            await api.patch(`/users/${userId}`, input);
            await reload();
          })
        }
        pagination={pagination}
        roles={roles}
        users={users}
        workspaces={workspaces}
      />
    </>
  );
}

function message(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Unable to load users.';
}
