'use client';

import type {
  Role,
  TenantUserDetailResponse,
  TenantUserListItem,
  TenantUserListQuery,
  TenantUserListResponse,
  TenantUserStatus,
} from '@payload/contracts';
import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

import { StatusBadge } from './status-badge';
import {
  DataTable,
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  PaginationControls,
  ResourceToolbar,
} from './ui/surfaces';

type UserCreateInput = {
  email: string;
  displayName?: string;
  password: string;
  roleId?: string;
  scope?: 'tenant' | 'workspace';
  workspaceId?: string;
};

export function UsersView({
  users,
  roles,
  workspaces,
  currentUserEmail,
  canCreate,
  canUpdate,
  canDisable,
  canRemove,
  canAssign,
  busy,
  pagination,
  onSearch,
  onPage,
  onCreate,
  onUpdate,
  onStatus,
  onRemove,
  onLoadDetail,
  onAssign,
  onUnassign,
}: {
  users: TenantUserListItem[];
  roles: Role[];
  workspaces: { id: string; name: string }[];
  currentUserEmail: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDisable: boolean;
  canRemove: boolean;
  canAssign: boolean;
  busy: boolean;
  pagination: TenantUserListResponse['pagination'];
  onSearch: (input: Pick<TenantUserListQuery, 'search' | 'status'>) => void;
  onPage: (offset: number) => void;
  onCreate: (input: UserCreateInput) => void | Promise<void>;
  onUpdate: (
    userId: string,
    input: { displayName?: string | null },
  ) => void | Promise<void>;
  onStatus: (userId: string, status: TenantUserStatus) => void | Promise<void>;
  onRemove: (userId: string) => void | Promise<void>;
  onLoadDetail: (userId: string) => Promise<TenantUserDetailResponse | null>;
  onAssign: (
    userId: string,
    input: {
      roleId: string;
      scope: 'tenant' | 'workspace';
      workspaceId?: string;
    },
  ) => void | Promise<void>;
  onUnassign: (userId: string, assignmentId: string) => void | Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | TenantUserStatus>('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [detail, setDetail] = useState<TenantUserDetailResponse | null>(null);
  const [detailMode, setDetailMode] = useState<'view' | 'edit'>('view');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserCreateInput>({
    email: '',
    displayName: '',
    password: '',
    roleId: roles[0]?.id ?? '',
    scope: 'tenant',
  });
  const [displayName, setDisplayName] = useState('');
  const [assignment, setAssignment] = useState({
    roleId: roles[0]?.id ?? '',
    scope: 'workspace' as 'tenant' | 'workspace',
    workspaceId: workspaces[0]?.id ?? '',
  });

  useEffect(() => {
    const firstRole = roles[0];
    const firstWorkspace = workspaces[0];
    if (!createForm.roleId && firstRole) {
      setCreateForm((current) => ({ ...current, roleId: firstRole.id }));
    }
    if (!assignment.roleId && firstRole) {
      setAssignment((current) => ({ ...current, roleId: firstRole.id }));
    }
    if (!assignment.workspaceId && firstWorkspace) {
      setAssignment((current) => ({ ...current, workspaceId: firstWorkspace.id }));
    }
  }, [assignment.roleId, assignment.workspaceId, createForm.roleId, roles, workspaces]);

  async function selectUser(userId: string, mode: 'view' | 'edit' = 'view') {
    setSelectedUserId(userId);
    setDetailMode(mode);
    const loaded = await onLoadDetail(userId);
    if (loaded) {
      setDetail(loaded);
      setDisplayName(loaded.user.displayName ?? '');
    }
  }

  async function refreshSelectedUser() {
    if (!selectedUserId) return;
    const loaded = await onLoadDetail(selectedUserId);
    if (loaded) {
      setDetail(loaded);
      setDisplayName(loaded.user.displayName ?? '');
    }
  }

  async function runDetailAction(action: () => void | Promise<void>) {
    await action();
    await refreshSelectedUser();
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch({ search: search.trim() || undefined, status: status || undefined });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      ...createForm,
      ...(createForm.displayName?.trim()
        ? { displayName: createForm.displayName.trim() }
        : {}),
      ...(createForm.roleId ? { roleId: createForm.roleId } : {}),
      ...(createForm.scope === 'workspace' && createForm.workspaceId
        ? { workspaceId: createForm.workspaceId }
        : {}),
    });
    setCreateForm({
      email: '',
      displayName: '',
      password: '',
      roleId: roles[0]?.id ?? '',
      scope: 'tenant',
    });
    setCreateOpen(false);
  }

  return (
    <>
      <PageHeader
        actions={
          canCreate ? (
            <button
              className="button button-primary"
              onClick={() => setCreateOpen(true)}
              type="button"
            >
              Create user
            </button>
          ) : null
        }
        description="Tenant-local accounts, status and workspace access. Passwords and session tokens are never displayed here."
        eyebrow="Settings · Team"
        title="Users"
      />
      <ResourceToolbar>
        <form className="user-search-form" onSubmit={submitSearch}>
          <input
            aria-label="Search users"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email or display name…"
            value={search}
          />
          <select
            aria-label="Filter users by status"
            onChange={(event) => setStatus(event.target.value as '' | TenantUserStatus)}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          <button className="button button-secondary" type="submit">
            Search
          </button>
        </form>
      </ResourceToolbar>
      <section className="panel">
        <div className="panel-heading">
          <h2>Tenant users</h2>
          <span className="pill">{pagination.total}</span>
        </div>
        {users.length === 0 ? (
          <EmptyState
            description="Try another search or use Create user to add the first team user."
            title="No users found"
          />
        ) : (
          <DataTable className="users-table">
            <caption className="sr-only">Tenant users and access</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Tenant access</th>
                <th scope="col">Workspace access</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  className={selectedUserId === user.id ? 'selected' : undefined}
                  key={user.id}
                >
                  <td>
                    <button
                      className="user-table-primary"
                      onClick={() => void selectUser(user.id)}
                      type="button"
                    >
                      <strong>{user.displayName || user.email}</strong>
                      <span className="table-secondary">{user.email}</span>
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={user.status} />
                  </td>
                  <td>
                    <span className="table-secondary user-role-summary">
                      {user.tenantRoleKeys.length > 0
                        ? user.tenantRoleKeys.join(', ')
                        : 'No tenant role'}
                    </span>
                  </td>
                  <td>{user.workspaceAccessCount} workspace(s)</td>
                  <td>
                    <div className="user-table-actions">
                      <button
                        className="button button-small button-ghost"
                        onClick={() => void selectUser(user.id)}
                        type="button"
                      >
                        View details
                      </button>
                      {canUpdate ? (
                        <button
                          className="button button-small button-secondary"
                          onClick={() => void selectUser(user.id, 'edit')}
                          type="button"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <PaginationControls
          busy={busy}
          className="user-pagination"
          noun="users"
          onNext={() => onPage(pagination.offset + pagination.limit)}
          onPrevious={() => onPage(Math.max(0, pagination.offset - pagination.limit))}
          pagination={pagination}
        />
      </section>
      {detail ? (
        <Drawer
          description={detail.user.email}
          eyebrow="User details"
          headerActions={
            canUpdate && detailMode !== 'edit' ? (
              <button
                className="button button-small button-secondary"
                onClick={() => setDetailMode('edit')}
                type="button"
              >
                Edit
              </button>
            ) : null
          }
          onClose={() => {
            setDetail(null);
            setSelectedUserId('');
            setDetailMode('view');
          }}
          open
          title={detail.user.displayName || detail.user.email}
        >
          <UserDetail
            busy={busy}
            canAssign={canAssign}
            canDisable={canDisable}
            canRemove={canRemove}
            currentUserEmail={currentUserEmail}
            detail={detail}
            detailMode={detailMode}
            displayName={displayName}
            onAssign={(input) =>
              void runDetailAction(() => onAssign(detail.user.id, input))
            }
            onCancelEdit={() => {
              setDisplayName(detail.user.displayName ?? '');
              setDetailMode('view');
            }}
            onChangeDisplayName={setDisplayName}
            onRemove={() =>
              void runDetailAction(async () => {
                await onRemove(detail.user.id);
                setDetail(null);
                setSelectedUserId('');
                setDetailMode('view');
              })
            }
            onStatus={(nextStatus) =>
              void runDetailAction(() => onStatus(detail.user.id, nextStatus))
            }
            onUnassign={(assignmentId) =>
              void runDetailAction(() => onUnassign(detail.user.id, assignmentId))
            }
            onUpdate={() =>
              void runDetailAction(async () => {
                await onUpdate(detail.user.id, {
                  displayName: displayName.trim() || null,
                });
                setDetailMode('view');
              })
            }
            roles={roles}
            setAssignment={setAssignment}
            assignment={assignment}
            workspaces={workspaces}
          />
        </Drawer>
      ) : null}
      <Modal
        description="Add an account and its initial access scope."
        eyebrow="Settings · Team"
        footer={
          <>
            <button
              className="button button-ghost"
              onClick={() => setCreateOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              form="create-user-form"
              type="submit"
            >
              Create user
            </button>
          </>
        }
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="Create user"
      >
        <form className="stack" id="create-user-form" onSubmit={submitCreate}>
          <label>
            Email
            <input
              autoComplete="email"
              required
              type="email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm({ ...createForm, email: event.target.value })
              }
            />
          </label>
          <label>
            Display name
            <input
              value={createForm.displayName}
              onChange={(event) =>
                setCreateForm({ ...createForm, displayName: event.target.value })
              }
            />
          </label>
          <label>
            Initial password
            <input
              minLength={8}
              required
              type="password"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm({ ...createForm, password: event.target.value })
              }
            />
          </label>
          <label>
            Initial role
            <select
              value={createForm.roleId}
              onChange={(event) =>
                setCreateForm({ ...createForm, roleId: event.target.value })
              }
            >
              <option value="">No role yet</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          {createForm.roleId ? (
            <label>
              Initial access scope
              <select
                value={createForm.scope}
                onChange={(event) =>
                  setCreateForm({
                    ...createForm,
                    scope: event.target.value as 'tenant' | 'workspace',
                  })
                }
              >
                <option value="tenant">Entire tenant</option>
                <option value="workspace">Current workspace</option>
              </select>
            </label>
          ) : null}
          {createForm.scope === 'workspace' && createForm.roleId ? (
            <label>
              Initial workspace
              <select
                required
                value={createForm.workspaceId ?? workspaces[0]?.id ?? ''}
                onChange={(event) =>
                  setCreateForm({ ...createForm, workspaceId: event.target.value })
                }
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </form>
      </Modal>
    </>
  );
}

function UserDetail({
  detail,
  detailMode,
  displayName,
  currentUserEmail,
  roles,
  workspaces,
  assignment,
  setAssignment,
  busy,
  canDisable,
  canRemove,
  canAssign,
  onChangeDisplayName,
  onCancelEdit,
  onUpdate,
  onStatus,
  onRemove,
  onAssign,
  onUnassign,
}: {
  detail: TenantUserDetailResponse;
  detailMode: 'view' | 'edit';
  displayName: string;
  currentUserEmail: string;
  roles: Role[];
  workspaces: { id: string; name: string }[];
  assignment: { roleId: string; scope: 'tenant' | 'workspace'; workspaceId: string };
  setAssignment: Dispatch<
    SetStateAction<{
      roleId: string;
      scope: 'tenant' | 'workspace';
      workspaceId: string;
    }>
  >;
  busy: boolean;
  canDisable: boolean;
  canRemove: boolean;
  canAssign: boolean;
  onChangeDisplayName: (value: string) => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onStatus: (status: TenantUserStatus) => void;
  onRemove: () => void;
  onAssign: (input: {
    roleId: string;
    scope: 'tenant' | 'workspace';
    workspaceId?: string;
  }) => void;
  onUnassign: (assignmentId: string) => void;
}) {
  const isSelf = detail.user.email === currentUserEmail;
  const isEditing = detailMode === 'edit';
  return (
    <div className="user-detail-body">
      <div className="detail-drawer-status-row">
        <StatusBadge status={detail.user.status} />
        <span className="muted small">
          Created {new Date(detail.user.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="two-column">
        <div className="stack">
          {isEditing ? (
            <>
              <label>
                Display name
                <input
                  autoFocus
                  disabled={busy}
                  value={displayName}
                  onChange={(event) => onChangeDisplayName(event.target.value)}
                />
              </label>
              <div className="row-actions">
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={onUpdate}
                  type="button"
                >
                  Save profile
                </button>
                <button
                  className="button button-ghost"
                  disabled={busy}
                  onClick={onCancelEdit}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="detail-field">
              <span className="muted small">Display name</span>
              <strong>{detail.user.displayName || 'Not set'}</strong>
            </div>
          )}
          <div className="row-actions">
            {canDisable && !isSelf ? (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      detail.user.status === 'active'
                        ? 'Disable this user and revoke their active sessions?'
                        : 'Enable this user?',
                    )
                  )
                    onStatus(detail.user.status === 'active' ? 'disabled' : 'active');
                }}
                type="button"
              >
                {detail.user.status === 'active' ? 'Disable user' : 'Enable user'}
              </button>
            ) : null}
            {canRemove && !isSelf ? (
              <button
                className="button button-danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Remove this user? The account will be soft-disabled and retained for audit history.',
                    )
                  )
                    onRemove();
                }}
                type="button"
              >
                Remove user
              </button>
            ) : null}
          </div>
          {isSelf ? (
            <p className="muted small">
              Your own status and roles cannot be changed here.
            </p>
          ) : null}
        </div>
        <div className="stack">
          <div>
            <strong>Tenant roles</strong>
            {detail.tenantRoles.length === 0 ? (
              <p className="muted">No tenant-wide role assignments.</p>
            ) : (
              <div className="list compact-list">
                {detail.tenantRoles.map((assignment) => (
                  <div className="list-row" key={assignment.id}>
                    <div>
                      <strong>{assignment.roleKey ?? assignment.roleId}</strong>
                      <span className="muted">Tenant-wide access</span>
                    </div>
                    {canAssign ? (
                      <button
                        className="button button-small button-danger"
                        disabled={busy}
                        onClick={() => onUnassign(assignment.id)}
                        type="button"
                      >
                        Unassign
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <strong>Workspace access</strong>
            {detail.workspaceAccess.length === 0 ? (
              <p className="muted">No readable workspace assignment.</p>
            ) : (
              <div className="list compact-list">
                {detail.workspaceAccess.map((access) => (
                  <div className="list-row" key={access.workspaceId}>
                    <div>
                      <strong>{access.workspaceName}</strong>
                      <span className="muted">
                        {access.roleKeys.join(', ') || 'Custom access'}
                      </span>
                    </div>
                    <span className="pill">{access.permissions.length} permissions</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {canAssign ? (
            <form
              className="form-actions"
              onSubmit={(event) => {
                event.preventDefault();
                onAssign({
                  roleId: assignment.roleId,
                  scope: assignment.scope,
                  ...(assignment.scope === 'workspace'
                    ? { workspaceId: assignment.workspaceId }
                    : {}),
                });
              }}
            >
              <select
                aria-label="User role"
                value={assignment.roleId}
                onChange={(event) =>
                  setAssignment({ ...assignment, roleId: event.target.value })
                }
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="User role scope"
                value={assignment.scope}
                onChange={(event) =>
                  setAssignment({
                    ...assignment,
                    scope: event.target.value as 'tenant' | 'workspace',
                  })
                }
              >
                <option value="tenant">Entire tenant</option>
                <option value="workspace">Workspace</option>
              </select>
              {assignment.scope === 'workspace' ? (
                <select
                  aria-label="User role workspace"
                  value={assignment.workspaceId}
                  onChange={(event) =>
                    setAssignment({ ...assignment, workspaceId: event.target.value })
                  }
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                className="button button-secondary"
                disabled={!assignment.roleId || busy}
                type="submit"
              >
                Assign role
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
