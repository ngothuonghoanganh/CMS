'use client';

import {
  type AccessRequest,
  type AccessRequestListResponse,
  type CreateInvitationsResponse,
  endpoints,
  type InvitationListResponse,
  type Member,
  type MemberListResponse,
  MEMBERS_MAX,
  roleLabels,
  roleSchema,
  type Site,
  type Access,
  accessLabel,
  type CustomRole,
  customRoleRef,
} from '@plp/contracts';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PlusIcon,
  SearchIcon,
  SegmentedControl,
  Select,
  UsersIcon,
  useToast,
  VisuallyHidden,
} from '@plp/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatRelativeTime } from '../../lib/format';
import { rolesHref } from '../shell/navigation';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { ScrollRegion } from '../shell/ScrollRegion';
import { useNow } from '../shell/use-now';
import { ChangeAccessDialog } from './ChangeAccessDialog';
import { InviteDialog } from './InviteDialog';
import { invitationStatus, scopeLabel } from './member-presentation';
import { memberQueryKeys } from './queries';
import { TransferOwnershipDialog } from './TransferOwnershipDialog';
import styles from './Members.module.css';

type Tab = 'members' | 'invitations' | 'requests';

/** The filter value of a member's role: the system role, or `custom:{id}`. */
function roleKey(access: Access): string {
  return typeof access === 'string' ? access : customRoleRef(access.customRoleId);
}

export interface MembersScreenProps {
  workspace: { id: string; name: string };
  /** The signed-in user and their role in the workspace. */
  viewer: { userId: string; role: Access };
  sites: readonly Site[];
  /** The workspace's custom roles, to give and to filter by (ADR-024). */
  initialCustomRoles: CustomRole[];
  initialMembers: MemberListResponse;
  initialInvitations: InvitationListResponse;
  /** Null for a Quản trị: only Chủ sở hữu decides requests (ADR-021). */
  initialRequests: AccessRequestListResponse | null;
  /** `?request=` from the email to Chủ sở hữu: the request to open. */
  openRequestId: string | null;
  loadedAt: number;
}

type Editing =
  { kind: 'member'; member: Member } | { kind: 'request'; member: Member; request: AccessRequest };

/**
 * Board 15 "Thành viên": the workspace's members, pending invitations and, for Chủ sở hữu, the
 * access requests to decide (ADR-021).
 */
export function MembersScreen({
  workspace,
  viewer,
  sites,
  initialCustomRoles,
  initialMembers,
  initialInvitations,
  initialRequests,
  openRequestId,
  loadedAt,
}: MembersScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const now = useNow(loadedAt);
  const isOwner = viewer.role === 'owner';
  const members = useQuery({
    queryKey: memberQueryKeys.members(workspace.id),
    queryFn: ({ signal }) => api(endpoints.listMembers, [workspace.id], { signal }),
    initialData: initialMembers,
    initialDataUpdatedAt: loadedAt,
  }).data.items;
  const invitations = useQuery({
    queryKey: memberQueryKeys.invitations(workspace.id),
    queryFn: ({ signal }) => api(endpoints.listInvitations, [workspace.id], { signal }),
    initialData: initialInvitations,
    initialDataUpdatedAt: loadedAt,
  }).data.items;
  const requests = useQuery({
    queryKey: memberQueryKeys.requests(workspace.id),
    queryFn: ({ signal }) => api(endpoints.listAccessRequests, [workspace.id], { signal }),
    initialData: initialRequests ?? { items: [] },
    initialDataUpdatedAt: loadedAt,
    enabled: initialRequests !== null,
  }).data.items;

  const customRoles = useQuery({
    queryKey: memberQueryKeys.customRoles(workspace.id),
    queryFn: ({ signal }) => api(endpoints.listCustomRoles, [workspace.id], { signal }),
    initialData: { items: initialCustomRoles },
    initialDataUpdatedAt: loadedAt,
  }).data.items;

  const requested = requests.find((request) => request.id === openRequestId) ?? null;
  const [tab, setTab] = useState<Tab>(requested === null ? 'members' : 'requests');
  // A system role, or `custom:{id}` for a custom role (ADR-024).
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(() => {
    const member = members.find((item) => item.userId === requested?.user.id);
    return requested !== null && member !== undefined
      ? { kind: 'request', member, request: requested }
      : null;
  });
  const [editOpen, setEditOpen] = useState(editing !== null);
  // Each opening of "Đổi quyền" starts from the member as they are: nothing left from the last.
  const [editKey, setEditKey] = useState(0);
  const [revoking, setRevoking] = useState<{ id: string; email: string } | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: memberQueryKeys.all(workspace.id) });
  }

  const resend = useMutation({
    mutationFn: (id: string) => api(endpoints.resendInvitation, [workspace.id, id]),
    onSuccess: (invitation) => {
      refresh();
      toast(
        invitation.sentAt === null
          ? { tone: 'warning', title: `Chưa gửi được lời mời tới ${invitation.email}` }
          : { tone: 'success', title: `Đã gửi lại lời mời tới ${invitation.email}` },
      );
    },
    onError: (error) => {
      reportUnexpected('Re-sending an invitation failed', error);
      toast({ tone: 'danger', title: 'Chưa gửi lại được', description: problemMessage(error) });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(endpoints.revokeInvitation, [workspace.id, id]),
    onSuccess: () => {
      setRevoking(null);
      refresh();
    },
    onError: (error) => {
      reportUnexpected('Revoking an invitation failed', error);
    },
  });

  function invited(result: CreateInvitationsResponse) {
    setInviteOpen(false);
    refresh();
    const count = (outcome: string) =>
      result.results.filter((item) => item.outcome === outcome).length;
    const parts = [
      count('sent') > 0 ? `Đã gửi ${count('sent')} lời mời` : null,
      count('unsent') > 0 ? `${count('unsent')} lời mời chưa gửi được, bấm "Gửi lại"` : null,
      count('already_member') > 0 ? `${count('already_member')} người đã là thành viên` : null,
      count('already_invited') > 0
        ? `${count('already_invited')} email đã có lời mời đang chờ`
        : null,
    ].filter((part): part is string => part !== null);
    toast({
      tone: count('unsent') > 0 ? 'warning' : 'success',
      title: parts[0] ?? 'Không có lời mời mới',
      description: parts.slice(1).join('. ') || undefined,
    });
  }

  const query = search.trim().toLowerCase();
  const shown = members.filter(
    (member) =>
      (roleFilter === 'all' || roleKey(member.role) === roleFilter) &&
      (siteFilter === 'all' || member.siteIds === null || member.siteIds.includes(siteFilter)) &&
      (query === '' ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)),
  );
  const admins = members.filter((member) => member.role === 'admin');
  const used = members.length + invitations.length;
  const memberOf = (userId: string) => members.find((member) => member.userId === userId);

  const tabs = [
    { value: 'members' as const, label: `Đang hoạt động · ${members.length}` },
    { value: 'invitations' as const, label: `Lời mời đang chờ · ${invitations.length}` },
    ...(initialRequests === null
      ? []
      : [{ value: 'requests' as const, label: `Yêu cầu đổi quyền · ${requests.length}` }]),
  ];

  return (
    <PageContainer width="wide">
      <PageHeader
        context={workspace.name}
        title="Thành viên"
        description={
          <>
            Người cùng làm việc trong {workspace.name} và các site họ được vào.{' '}
            <Link href={rolesHref(workspace.id)}>Xem vai trò &amp; quyền</Link>
          </>
        }
        actions={
          <>
            <span className={styles.seats}>
              Đang dùng {used}/{MEMBERS_MAX} chỗ
            </span>
            <Button
              leadingIcon={<PlusIcon size={16} />}
              disabled={used >= MEMBERS_MAX}
              onClick={() => {
                setInviteKey((key) => key + 1);
                setInviteOpen(true);
              }}
            >
              Mời thành viên
            </Button>
          </>
        }
      />

      <div className={styles.toolbar}>
        <SegmentedControl<Tab>
          aria-label="Danh sách"
          options={tabs}
          value={tab}
          onChange={setTab}
        />
        {tab === 'members' ? (
          <div className={styles.filters}>
            <Field label="Lọc theo vai trò" hideLabel id="members-role">
              <Select
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                }}
              >
                <option value="all">Mọi vai trò</option>
                {roleSchema.options.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
                {customRoles.map((role) => (
                  <option key={role.id} value={customRoleRef(role.id)}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lọc theo site" hideLabel id="members-site">
              <Select
                value={siteFilter}
                onChange={(event) => {
                  setSiteFilter(event.target.value);
                }}
              >
                <option value="all">Mọi site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tìm thành viên" hideLabel id="members-search">
              <Input
                type="search"
                leadingIcon={<SearchIcon size={16} />}
                placeholder="Tên hoặc email"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <section aria-label={tabs.find((item) => item.value === tab)?.label} className={styles.card}>
        {tab === 'members' ? (
          shown.length === 0 ? (
            <EmptyState
              headingLevel={3}
              icon={<SearchIcon size={24} />}
              title="Không có thành viên nào khớp"
              description="Thử vai trò, site hoặc từ khóa khác."
            />
          ) : (
            <ScrollRegion label="Danh sách thành viên">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">THÀNH VIÊN</th>
                    <th scope="col">VAI TRÒ</th>
                    <th scope="col">PHẠM VI</th>
                    <th scope="col">THAM GIA</th>
                    <th scope="col">
                      <VisuallyHidden>Thao tác</VisuallyHidden>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((member) => {
                    const self = member.userId === viewer.userId;
                    return (
                      <tr key={member.userId}>
                        <th scope="row" className={styles.person}>
                          <Avatar name={member.name} />
                          <span className={styles.stack}>
                            <span className={styles.name}>
                              {member.name}
                              {self ? ' (bạn)' : ''}
                            </span>
                            <span className={styles.email}>{member.email}</span>
                          </span>
                        </th>
                        <td>
                          <Badge tone={member.role === 'owner' ? 'primary' : 'neutral'}>
                            {accessLabel(member.role)}
                          </Badge>
                        </td>
                        <td>{scopeLabel(member.siteIds, sites)}</td>
                        <td>{formatDate(member.joinedAt)}</td>
                        <td className={styles.actions}>
                          {member.role !== 'owner' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Đổi quyền của ${member.name}`}
                              onClick={() => {
                                setEditing({ kind: 'member', member });
                                setEditKey((key) => key + 1);
                                setEditOpen(true);
                              }}
                            >
                              Đổi quyền
                            </Button>
                          ) : self && isOwner ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setTransferOpen(true);
                              }}
                            >
                              Chuyển quyền sở hữu
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          )
        ) : null}

        {tab === 'invitations' ? (
          invitations.length === 0 ? (
            <EmptyState
              headingLevel={3}
              icon={<UsersIcon size={24} />}
              title="Không có lời mời nào đang chờ"
              description="Lời mời đã nhận, bị thu hồi hoặc bị từ chối không còn ở đây."
            />
          ) : (
            <>
              <ScrollRegion label="Lời mời đang chờ">
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">EMAIL ĐƯỢC MỜI</th>
                      <th scope="col">VAI TRÒ</th>
                      <th scope="col">PHẠM VI</th>
                      <th scope="col">TRẠNG THÁI</th>
                      <th scope="col">
                        <VisuallyHidden>Thao tác</VisuallyHidden>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((invitation) => {
                      const status = invitationStatus(invitation, now);
                      return (
                        <tr key={invitation.id}>
                          <th scope="row" className={styles.stack}>
                            <span className={styles.name}>{invitation.email}</span>
                            <span className={styles.email}>
                              Mời bởi {invitation.invitedBy.name} ·{' '}
                              {formatRelativeTime(invitation.createdAt, now)}
                            </span>
                          </th>
                          <td>
                            <Badge tone="neutral">{accessLabel(invitation.role)}</Badge>
                          </td>
                          <td>{scopeLabel(invitation.siteIds, sites)}</td>
                          <td>
                            <Badge tone={status.tone} dot>
                              {status.label}
                            </Badge>
                          </td>
                          <td className={styles.actions}>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Gửi lại lời mời tới ${invitation.email}`}
                              loading={resend.isPending && resend.variables === invitation.id}
                              onClick={() => {
                                resend.mutate(invitation.id);
                              }}
                            >
                              Gửi lại
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Thu hồi lời mời tới ${invitation.email}`}
                              onClick={() => {
                                setRevoking({ id: invitation.id, email: invitation.email });
                              }}
                            >
                              Thu hồi
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollRegion>
              <p className={styles.footnote}>
                Lời mời chỉ dùng được một lần, cho đúng email được mời, và hết hạn sau 7 ngày.
              </p>
            </>
          )
        ) : null}

        {tab === 'requests' ? (
          requests.length === 0 ? (
            <EmptyState
              headingLevel={3}
              icon={<UsersIcon size={24} />}
              title="Không có yêu cầu nào chờ duyệt"
              description="Khi thành viên xin đổi quyền, bạn nhận email và yêu cầu hiện ở đây."
            />
          ) : (
            <ScrollRegion label="Yêu cầu đổi quyền">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">NGƯỜI YÊU CẦU</th>
                    <th scope="col">HIỆN TẠI</th>
                    <th scope="col">XIN LÀM</th>
                    <th scope="col">LỜI NHẮN</th>
                    <th scope="col">
                      <VisuallyHidden>Thao tác</VisuallyHidden>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => {
                    const member = memberOf(request.user.id);
                    return (
                      <tr key={request.id}>
                        <th scope="row" className={styles.stack}>
                          <span className={styles.name}>{request.user.name}</span>
                          <span className={styles.email}>
                            {request.user.email} · {formatRelativeTime(request.createdAt, now)}
                          </span>
                        </th>
                        <td>
                          {accessLabel(request.current.role)} ·{' '}
                          {scopeLabel(request.current.siteIds, sites)}
                        </td>
                        <td>
                          {roleLabels[request.role]}
                          {request.wholeWorkspace ? ' · Toàn workspace' : ''}
                        </td>
                        <td className={styles.noteCell}>
                          {request.note === '' ? '—' : request.note}
                        </td>
                        <td className={styles.actions}>
                          {member === undefined ? null : (
                            <Button
                              size="sm"
                              aria-label={`Xem và duyệt yêu cầu của ${request.user.name}`}
                              onClick={() => {
                                setEditing({ kind: 'request', member, request });
                                setEditKey((key) => key + 1);
                                setEditOpen(true);
                              }}
                            >
                              Xem &amp; duyệt
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          )
        ) : null}
      </section>

      {inviteKey === 0 ? null : (
        <InviteDialog
          key={inviteKey}
          workspaceId={workspace.id}
          sites={sites}
          customRoles={customRoles}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onInvited={invited}
        />
      )}
      {editing === null ? null : (
        <ChangeAccessDialog
          key={editKey}
          workspaceId={workspace.id}
          member={editing.member}
          sites={sites}
          customRoles={customRoles}
          request={editing.kind === 'request' ? editing.request : null}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={(member) => {
            setEditOpen(false);
            refresh();
            toast({ tone: 'success', title: `Đã lưu quyền của ${member.name}` });
          }}
          onRemoved={() => {
            setEditOpen(false);
            refresh();
            toast({ tone: 'success', title: `Đã gỡ ${editing.member.name} khỏi workspace` });
          }}
          onDeclined={() => {
            setEditOpen(false);
            refresh();
            toast({ tone: 'success', title: `Đã từ chối yêu cầu của ${editing.member.name}` });
          }}
        />
      )}
      {isOwner ? (
        <TransferOwnershipDialog
          key={transferOpen ? 'open' : 'closed'}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          admins={admins}
          open={transferOpen}
          onOpenChange={setTransferOpen}
          onTransferred={(result) => {
            // Now a Quản trị: the server renders the page again with the new role.
            queryClient.setQueryData(memberQueryKeys.members(workspace.id), result);
            setTransferOpen(false);
            toast({ tone: 'success', title: 'Đã chuyển quyền sở hữu' });
            router.refresh();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevoking(null);
          }
        }}
        tone="danger"
        title={`Thu hồi lời mời tới ${revoking?.email ?? ''}?`}
        description="Link trong email sẽ không còn dùng được. Bạn có thể mời lại sau."
        confirmLabel="Thu hồi"
        pending={revoke.isPending}
        error={revoke.isError ? problemMessage(revoke.error) : undefined}
        onConfirm={() => {
          if (revoking !== null) {
            revoke.mutate(revoking.id);
          }
        }}
      />
    </PageContainer>
  );
}
