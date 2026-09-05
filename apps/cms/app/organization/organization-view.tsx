'use client';

import type { Organization, OrganizationMembership, Workspace } from '@payload/contracts';
import type { FormEvent } from 'react';

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
  return (
    <>
      <PageHeader
        description="Manage organization ownership, workspaces and members."
        eyebrow="Organization"
        title={organization?.name ?? 'Organizations'}
      />
      <div className="toolbar">
        <label className="inline-field">
          Organization
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
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <h2>Create an organization</h2>
          </div>
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
        <section className="panel">
          <div className="panel-heading">
            <h2>Workspaces</h2>
            <span className="pill">{workspaces.length}</span>
          </div>
          {canCreateWorkspace ? (
            <form className="form-actions" onSubmit={onCreateWorkspace}>
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
            <div className="list">
              {workspaces.map((workspace) => (
                <div className="list-row" key={workspace.id}>
                  <strong>{workspace.name}</strong>
                  <span className="muted">{workspace.id.slice(0, 8)}</span>
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
      <section className="panel">
        <div className="panel-heading">
          <h2>Members</h2>
          <span className="pill">{members.length}</span>
        </div>
        {canAddMember ? (
          <form className="form-actions" onSubmit={onAddMember}>
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
          <div className="list">
            {members.map((member) => (
              <div className="list-row" key={member.id}>
                <div>
                  <strong>{member.userId}</strong>
                  <span className="muted">{member.role}</span>
                </div>
                <div className="row-actions">
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
