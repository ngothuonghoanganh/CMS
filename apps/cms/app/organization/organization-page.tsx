'use client';

import {
  OrganizationMembershipListResponseSchema,
  type Organization,
  type OrganizationMembership,
  type Workspace,
} from '@payload/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { OrganizationView } from './organization-view';

export default function OrganizationPage() {
  const { can, organizations, session, workspaces: shellWorkspaces } = useCmsShell();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    session.workspace.organizationId,
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>(shellWorkspaces);
  const [members, setMembers] = useState<OrganizationMembership[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(organizationId = selectedOrganizationId) {
    try {
      const workspaceResponse = await api.get(
        `/organizations/${organizationId}/workspaces`,
      );
      setWorkspaces((workspaceResponse as { items: Workspace[] }).items);
      if (can('member.read')) {
        const response = await api.get(`/organizations/${organizationId}/members`);
        setMembers(OrganizationMembershipListResponseSchema.parse(response).items);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to load organization.',
      );
    }
  }
  useEffect(() => {
    void load();
  }, [selectedOrganizationId, can]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to update organization.',
      );
    } finally {
      setBusy(false);
    }
  }
  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return action(async () => {
      const created = await api.post<Organization>('/organizations', {
        name,
        ...(slug ? { slug } : {}),
      });
      setName('');
      setSlug('');
      setSelectedOrganizationId(created.id);
    });
  }
  function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return action(async () => {
      await api.post(`/organizations/${selectedOrganizationId}/workspaces`, {
        name: workspaceName,
      });
      setWorkspaceName('');
    });
  }
  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return action(async () => {
      await api.post(`/organizations/${selectedOrganizationId}/members`, {
        userId: memberUserId,
        role: memberRole,
      });
      setMemberUserId('');
    });
  }
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <OrganizationView
        busy={busy}
        canAddMember={can('member.add')}
        canCreateOrganization={can('workspace.create')}
        canCreateWorkspace={can('workspace.create')}
        canRemoveMember={can('member.remove')}
        canUpdateMember={can('member.update')}
        memberRole={memberRole}
        memberUserId={memberUserId}
        members={members}
        name={name}
        onAddMember={(event) => void addMember(event)}
        onChangeMemberRole={(member, role) =>
          void action(async () => {
            await api.patch(
              `/organizations/${selectedOrganizationId}/members/${member.id}`,
              { role },
            );
          })
        }
        onCreate={(event) => void createOrganization(event)}
        onCreateWorkspace={(event) => void createWorkspace(event)}
        onRemoveMember={(member) =>
          void action(async () => {
            await api.delete(
              `/organizations/${selectedOrganizationId}/members/${member.id}`,
            );
          })
        }
        onSelectOrganization={(id) => setSelectedOrganizationId(id)}
        onSetMemberRole={setMemberRole}
        onSetMemberUserId={setMemberUserId}
        onSetName={setName}
        onSetSlug={setSlug}
        onSetWorkspaceName={setWorkspaceName}
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        slug={slug}
        workspaceName={workspaceName}
        workspaces={workspaces}
      />
    </>
  );
}
