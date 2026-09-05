'use client';

import type { Organization, OrganizationMembership, Workspace } from '@payload/contracts';
import type { FormEvent } from 'react';

import { StatusBadge } from '../status-badge';
import { EmptyState, PageHeader } from '../ui/surfaces';

export function OrganizationView({
  organizations,
  selectedOrganizationId,
  workspaces,
  members,
  memberRole,
  memberUserId,
  name,
  slug,
  workspaceName,
  busy,
  onSelectOrganization,
  onCreate,
  onSetName,
  onSetMemberRole,
  onSetMemberUserId,
  onSetSlug,
  onCreateWorkspace,
  onSetWorkspaceName,
  onAddMember,
  onChangeMemberRole,
  onRemoveMember,
  canAddMember,
  canCreateOrganization,
  canCreateWorkspace,
  canRemoveMember,
  canUpdateMember,
}: {
  organizations: Organization[];
  selectedOrganizationId: string;
  workspaces: Workspace[];
  members: OrganizationMembership[];
  memberRole: 'admin' | 'member';
  memberUserId: string;
  name: string;
  slug: string;
  workspaceName: string;
  busy: boolean;
  onSelectOrganization: (id: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onSetName: (value: string) => void;
  onSetMemberRole: (value: 'admin' | 'member') => void;
  onSetMemberUserId: (value: string) => void;
  onSetSlug: (value: string) => void;
  onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onSetWorkspaceName: (value: string) => void;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onChangeMemberRole: (
    member: OrganizationMembership,
    role: OrganizationMembership['role'],
  ) => void;
  onRemoveMember: (member: OrganizationMembership) => void;
  canAddMember: boolean;
  canCreateOrganization: boolean;
  canCreateWorkspace: boolean;
  canRemoveMember: boolean;
  canUpdateMember: boolean;
}) {
  const organization = organizations.find((item) => item.id === selectedOrganizationId);
  const organizationInitials = initials(organization?.name ?? 'Organization');
  return (
    <>
      <PageHeader
        description="Manage organization ownership, workspaces and members."
        eyebrow="Organization"
        title={organization?.name ?? 'Organizations'}
      >
        <div className="organization-header-meta">
          <StatusBadge status={organization?.status ?? 'active'} />
          <span>{organization?.slug ?? 'Select an organization'}</span>
        </div>
      </PageHeader>
      <section aria-label="Organization overview" className="organization-context-card">
        <div className="organization-identity">
          <div aria-hidden="true" className="organization-avatar">
            {organizationInitials}
          </div>
          <div className="organization-identity-copy">
            <span className="eyebrow">Current organization</span>
            <strong>{organization?.name ?? 'No organization selected'}</strong>
            <span className="muted">
              {organization?.slug
                ? `/${organization.slug}`
                : 'Choose an organization to continue'}
            </span>
          </div>
        </div>
        <label className="organization-context-select">
          <span className="eyebrow">Switch context</span>
          <select
            aria-label="Organization management context"
            onChange={(event) => onSelectOrganization(event.target.value)}
            value={selectedOrganizationId}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.status}
              </option>
            ))}
          </select>
        </label>
        <div className="organization-stat-grid">
          <div className="organization-stat">
            <span className="eyebrow">Workspaces</span>
            <strong>{workspaces.length}</strong>
            <span className="muted">Delivery environments</span>
          </div>
          <div className="organization-stat">
            <span className="eyebrow">Members</span>
            <strong>{members.length}</strong>
            <span className="muted">People with access</span>
          </div>
          <div className="organization-stat organization-stat-status">
            <span className="eyebrow">Status</span>
            <StatusBadge status={organization?.status ?? 'active'} />
            <span className="muted">Organization availability</span>
          </div>
        </div>
      </section>
      <div className="organization-main-grid">
        <section className="panel organization-create-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">New organization</span>
              <h2>Create an organization</h2>
            </div>
            <span aria-hidden="true" className="organization-panel-mark">
              +
            </span>
          </div>
          <p className="panel-description">
            Start a separate workspace for a new brand, client or team.
          </p>
          {canCreateOrganization ? (
            <form className="stack" onSubmit={onCreate}>
              <label>
                Organization name
                <input
                  value={name}
                  onChange={(event) => onSetName(event.target.value)}
                  required
                />
              </label>
              <label>
                Slug <span className="muted">(optional)</span>
                <input value={slug} onChange={(event) => onSetSlug(event.target.value)} />
              </label>
              <button className="button button-primary" disabled={busy} type="submit">
                Create organization
              </button>
            </form>
          ) : (
            <p className="muted">You do not have permission to create organizations.</p>
          )}
        </section>
        <section className="panel organization-workspaces-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Workspace portfolio</span>
              <h2>Workspaces</h2>
            </div>
            <span className="count-badge">{workspaces.length}</span>
          </div>
          <p className="panel-description">
            Each workspace keeps sites, pages and permissions scoped to one environment.
          </p>
          {canCreateWorkspace ? (
            <form className="organization-inline-form" onSubmit={onCreateWorkspace}>
              <input
                aria-label="New workspace name"
                onChange={(event) => onSetWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                required
                value={workspaceName}
              />
              <button className="button button-secondary" disabled={busy} type="submit">
                Add workspace
              </button>
            </form>
          ) : null}
          {workspaces.length ? (
            <div className="organization-workspace-list">
              {workspaces.map((workspace) => (
                <div className="organization-workspace-row" key={workspace.id}>
                  <div className="workspace-avatar" aria-hidden="true">
                    {initials(workspace.name)}
                  </div>
                  <div className="workspace-row-copy">
                    <strong>{workspace.name}</strong>
                    <span className="muted">
                      Workspace ID · {workspace.id.slice(0, 8)}
                    </span>
                  </div>
                  <span className="workspace-row-status">Workspace</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              description="Create a workspace for this organization."
              title="No workspaces"
            />
          )}
        </section>
      </div>
      <section className="panel organization-members-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Access control</span>
            <h2>Members</h2>
          </div>
          <span className="count-badge">{members.length}</span>
        </div>
        <p className="panel-description">
          Invite teammates and keep organization roles up to date.
        </p>
        {canAddMember ? (
          <form className="organization-member-form" onSubmit={onAddMember}>
            <input
              aria-label="Member user id"
              onChange={(event) => onSetMemberUserId(event.target.value)}
              placeholder="Existing user id or email"
              required
              value={memberUserId}
            />
            <select
              aria-label="Member role"
              onChange={(event) =>
                onSetMemberRole(event.target.value as 'admin' | 'member')
              }
              value={memberRole}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button className="button button-secondary" disabled={busy} type="submit">
              Add member
            </button>
          </form>
        ) : null}
        {members.length ? (
          <div className="organization-member-list">
            {members.map((member) => (
              <div className="organization-member-row" key={member.id}>
                <div className="member-avatar" aria-hidden="true">
                  {initials(member.userId)}
                </div>
                <div className="member-row-copy">
                  <strong>{member.userId}</strong>
                  <span className="muted">Added member · {member.role}</span>
                </div>
                <div className="organization-member-actions">
                  {canUpdateMember && member.role !== 'owner' ? (
                    <select
                      aria-label={`Role for ${member.userId}`}
                      onChange={(event) =>
                        onChangeMemberRole(
                          member,
                          event.target.value as OrganizationMembership['role'],
                        )
                      }
                      value={member.role}
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  ) : null}
                  {canRemoveMember ? (
                    <button
                      className="button button-small button-danger"
                      onClick={() => onRemoveMember(member)}
                      type="button"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            description="The organization has no readable members."
            title="No members"
          />
        )}
      </section>
    </>
  );
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
