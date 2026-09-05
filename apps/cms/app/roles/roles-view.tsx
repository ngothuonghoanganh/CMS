'use client';

import { TenantPermissions, type Role, type TenantPermission } from '@payload/contracts';
import { useEffect, useMemo, useState } from 'react';

import { StatusBadge } from '../status-badge';
import { Modal, PageHeader, ResourceToolbar } from '../ui/surfaces';

const permissionLabels: Record<TenantPermission, string> = Object.fromEntries(
  Object.values(TenantPermissions).map((permission) => [
    permission,
    permission.replaceAll('.', ' · ').replaceAll('-', ' '),
  ]),
) as Record<TenantPermission, string>;

export function RolesView({
  roles,
  workspaceId,
  currentUserId,
  canManage,
  canAssign,
  onCreate,
  onUpdate,
  onAssign,
}: {
  roles: Role[];
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
  canAssign: boolean;
  onCreate: (input: {
    key: string;
    name: string;
    description?: string;
    permissions: TenantPermission[];
  }) => void;
  onUpdate: (
    roleId: string,
    input: {
      name?: string;
      description?: string | null;
      permissions?: TenantPermission[];
    },
  ) => void;
  onAssign: (input: {
    userId: string;
    roleId: string;
    scope: 'tenant' | 'workspace';
    workspaceId?: string;
  }) => void;
}) {
  const [form, setForm] = useState({ key: '', name: '', description: '' });
  const [selectedPermissions, setSelectedPermissions] = useState<TenantPermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [editPermissions, setEditPermissions] = useState<TenantPermission[]>([]);
  const [assignment, setAssignment] = useState({
    userId: '',
    roleId: roles[0]?.id ?? '',
    scope: 'workspace' as 'tenant' | 'workspace',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const selectedRole = roles.find((role) => role.id === selectedRoleId);

  useEffect(() => {
    const firstRole = roles[0];
    if (!assignment.roleId && firstRole) {
      setAssignment((current) => ({ ...current, roleId: firstRole.id }));
    }
  }, [assignment.roleId, roles]);

  useEffect(() => {
    if (!selectedRole) return;
    setEditForm({
      description: selectedRole.description ?? '',
      name: selectedRole.name,
    });
    setEditPermissions(selectedRole.permissions);
  }, [selectedRole]);

  function togglePermission(permission: TenantPermission) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            {canAssign ? (
              <button
                className="button button-secondary"
                onClick={() => setAssignOpen(true)}
                type="button"
              >
                Assign role
              </button>
            ) : null}
            {canManage ? (
              <button
                className="button button-primary"
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                Create role
              </button>
            ) : null}
          </>
        }
        description={`Manage tenant roles and scoped assignments for workspace ${workspaceId.slice(0, 8)}.`}
        eyebrow="Access control"
        title="Roles"
      />
      <ResourceToolbar>
        <span className="muted small">{roles.length} role(s)</span>
        <span className="muted small">System roles are read-only</span>
      </ResourceToolbar>
      <section className="panel">
        <PanelTitle title="Available roles" count={roles.length} />
        {roles.length ? (
          <div className="list role-list">
            {roles.map((role) => {
              const isSelected = selectedRoleId === role.id;
              return (
                <button
                  aria-pressed={isSelected}
                  className={
                    isSelected ? 'list-row selectable selected' : 'list-row selectable'
                  }
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  type="button"
                >
                  <span className="role-list-copy">
                    <strong>{role.name}</strong>
                    <span className="muted">
                      {role.key} · {role.userCount} assignment(s)
                    </span>
                    {role.description ? (
                      <span className="muted small">{role.description}</span>
                    ) : null}
                    <span className="muted small">
                      {role.permissions.length} permission(s)
                      {role.permissions.length
                        ? ` · ${role.permissions
                            .slice(0, 3)
                            .map((permission) => permissionLabels[permission])
                            .join(', ')}${role.permissions.length > 3 ? '…' : ''}`
                        : ''}
                    </span>
                  </span>
                  <StatusBadge status={role.type} />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No roles available"
            description="Roles will appear here when they are available in this workspace."
          />
        )}
      </section>
      <Modal
        description="Define a reusable permission set for this tenant."
        eyebrow="Access control"
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
              form="create-role-form"
              type="submit"
            >
              Create role
            </button>
          </>
        }
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        size="lg"
        title="Create custom role"
      >
        {canManage ? (
          <form
            className="stack"
            id="create-role-form"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate({
                key: form.key,
                name: form.name,
                ...(form.description ? { description: form.description } : {}),
                permissions: selectedPermissions,
              });
              setForm({ key: '', name: '', description: '' });
              setSelectedPermissions([]);
              setCreateOpen(false);
            }}
          >
            <label>
              Key
              <input
                aria-label="Role key"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={form.key}
                onChange={(event) => setForm({ ...form, key: event.target.value })}
              />
            </label>
            <label>
              Name
              <input
                aria-label="Role name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              Description
              <input
                aria-label="Role description"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <PermissionPicker
              selected={selectedPermissions}
              onToggle={togglePermission}
            />
          </form>
        ) : null}
      </Modal>
      <Modal
        description={
          selectedRole?.description ?? 'Review the role permissions and update access.'
        }
        eyebrow={selectedRole?.type === 'custom' ? 'Custom role' : 'System role'}
        footer={
          selectedRole?.type === 'custom' && canManage ? (
            <>
              <button
                className="button button-ghost"
                onClick={() => setSelectedRoleId('')}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                form="edit-role-form"
                type="submit"
              >
                Save role access
              </button>
            </>
          ) : undefined
        }
        onClose={() => setSelectedRoleId('')}
        open={Boolean(selectedRole)}
        size="lg"
        title={selectedRole ? `Edit ${selectedRole.name}` : 'Role details'}
      >
        {selectedRole?.type === 'custom' && canManage ? (
          <form
            className="stack"
            id="edit-role-form"
            onSubmit={(event) => {
              event.preventDefault();
              onUpdate(selectedRole.id, {
                description: editForm.description || null,
                name: editForm.name,
                permissions: editPermissions,
              });
              setSelectedRoleId('');
            }}
          >
            <div className="form-context">
              <span className="muted small">Key: {selectedRole.key}</span>
            </div>
            <label>
              Name
              <input
                required
                value={editForm.name}
                onChange={(event) =>
                  setEditForm({ ...editForm, name: event.target.value })
                }
              />
            </label>
            <label>
              Description
              <input
                value={editForm.description}
                onChange={(event) =>
                  setEditForm({ ...editForm, description: event.target.value })
                }
              />
            </label>
            <PermissionPicker
              selected={editPermissions}
              onToggle={(permission) =>
                setEditPermissions((current) =>
                  current.includes(permission)
                    ? current.filter((item) => item !== permission)
                    : [...current, permission],
                )
              }
            />
          </form>
        ) : selectedRole ? (
          <div className="empty-state">
            <strong>{selectedRole.name} is a system role</strong>
            <span className="muted">
              Its permissions are managed by the platform and cannot be edited here.
            </span>
            <span className="muted small">
              {selectedRole.permissions.length} permission(s) · {selectedRole.userCount}{' '}
              assignment(s)
            </span>
          </div>
        ) : null}
      </Modal>
      <Modal
        description="Choose a role and scope for the user."
        eyebrow="Access control"
        footer={
          <>
            <button
              className="button button-ghost"
              onClick={() => setAssignOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={!assignment.roleId}
              form="assign-role-form"
              type="submit"
            >
              Assign role
            </button>
          </>
        }
        onClose={() => setAssignOpen(false)}
        open={assignOpen}
        size="md"
        title="Assign a role"
      >
        {canAssign ? (
          <form
            className="stack"
            id="assign-role-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAssign({
                userId: assignment.userId || currentUserId,
                roleId: assignment.roleId,
                scope: assignment.scope,
                ...(assignment.scope === 'workspace' ? { workspaceId } : {}),
              });
              setAssignOpen(false);
            }}
          >
            <label>
              User
              <input
                aria-label="Role assignment user id"
                placeholder={`User id or email (${currentUserId})`}
                required={!currentUserId}
                value={assignment.userId}
                onChange={(event) =>
                  setAssignment({ ...assignment, userId: event.target.value })
                }
              />
            </label>
            <label>
              Role
              <select
                aria-label="Role assignment role"
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
            </label>
            <label>
              Scope
              <select
                aria-label="Role assignment scope"
                value={assignment.scope}
                onChange={(event) =>
                  setAssignment({
                    ...assignment,
                    scope: event.target.value as 'tenant' | 'workspace',
                  })
                }
              >
                <option value="workspace">Current workspace</option>
                <option value="tenant">Entire tenant</option>
              </select>
            </label>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

function PermissionPicker({
  selected,
  onToggle,
}: {
  selected: TenantPermission[];
  onToggle: (permission: TenantPermission) => void;
}) {
  const [search, setSearch] = useState('');
  const permissions = Object.values(TenantPermissions) as TenantPermission[];
  const visiblePermissions = permissions.filter((permission) => {
    const query = search.trim().toLowerCase();
    const label = permissionLabels[permission] ?? permission;
    return (
      !query ||
      permission.toLowerCase().includes(query) ||
      label.toLowerCase().includes(query)
    );
  });
  const permissionGroups = useMemo(() => {
    const groups = new Map<string, TenantPermission[]>();
    visiblePermissions.forEach((permission) => {
      const group = permission.split('.')[0] ?? 'other';
      groups.set(group, [...(groups.get(group) ?? []), permission]);
    });
    return [...groups.entries()];
  }, [visiblePermissions]);
  const allVisibleSelected =
    visiblePermissions.length > 0 &&
    visiblePermissions.every((permission) => selected.includes(permission));
  const selectionLabel = search.trim() ? 'visible' : 'all';

  function toggleAllVisible() {
    if (allVisibleSelected) {
      visiblePermissions.forEach((permission) => onToggle(permission));
      return;
    }
    visiblePermissions
      .filter((permission) => !selected.includes(permission))
      .forEach((permission) => onToggle(permission));
  }

  return (
    <fieldset className="stack compact-stack">
      <legend>Permissions</legend>
      <div className="permission-picker-toolbar">
        <input
          aria-label="Search permissions"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search permissions…"
          value={search}
        />
        <button className="button button-small" onClick={toggleAllVisible} type="button">
          {allVisibleSelected ? `Clear ${selectionLabel}` : `Select ${selectionLabel}`}
        </button>
        <span className="muted small">
          {selected.length}/{permissions.length} selected
        </span>
      </div>
      <div aria-label="Permission list" className="permission-list">
        {visiblePermissions.length ? (
          permissionGroups.map(([group, groupPermissions]) => (
            <div className="permission-group" key={group}>
              <strong className="permission-group-heading">{group}</strong>
              {groupPermissions.map((permission) => (
                <label className="checkbox-field" key={permission}>
                  <input
                    checked={selected.includes(permission)}
                    onChange={() => onToggle(permission)}
                    type="checkbox"
                  />
                  <span>
                    {permissionLabels[permission]}
                    <span className="muted small">{permission}</span>
                  </span>
                </label>
              ))}
            </div>
          ))
        ) : (
          <span className="muted small">No permissions match your search.</span>
        )}
      </div>
    </fieldset>
  );
}

function PanelTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {count === undefined ? null : <span className="pill">{count}</span>}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
    </div>
  );
}
