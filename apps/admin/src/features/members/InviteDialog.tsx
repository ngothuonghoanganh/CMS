'use client';

import {
  type CreateInvitationsResponse,
  type CustomRole,
  endpoints,
  INVITATION_VALID_DAYS,
  INVITE_EMAILS_MAX,
  type RoleChoice,
  type Site,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, RadioCardGroup } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { PermissionSummary, SiteScopeFields } from './ChangeAccessDialog';
import { EmailChips, type EmailChipsValue } from './EmailChips';
import {
  inviteEmailProblem,
  knownEmails,
  normalizeEmail,
  permissionSummary,
  roleOptions,
} from './member-presentation';
import styles from './Members.module.css';

export interface InviteDialogProps {
  workspaceId: string;
  sites: readonly Site[];
  /** The workspace's custom roles, offered after the system ones (ADR-024). */
  customRoles: readonly CustomRole[];
  /** Screen 15's members and pending invitations: their emails need no invitation. */
  members: readonly { email: string }[];
  invitations: readonly { email: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (result: CreateInvitationsResponse) => void;
}

/**
 * "Mời thành viên" (board 15): up to 10 emails, one role and scope. Each email gets a link that
 * works once, for that email, for 7 days (ADR-021).
 */
export function InviteDialog({
  workspaceId,
  sites,
  customRoles,
  members,
  invitations,
  open,
  onOpenChange,
  onInvited,
}: InviteDialogProps) {
  const [chips, setChips] = useState<EmailChipsValue>({ emails: [], draft: '' });
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [role, setRole] = useState<RoleChoice>('editor');
  const options = roleOptions(customRoles);
  // A custom role removed while the dialog was open is not replaced by another one.
  const option = options.find((item) => item.value === role) ?? null;
  const [scope, setScope] = useState<'all' | 'sites'>(sites.length > 1 ? 'sites' : 'all');
  const [chosen, setChosen] = useState<string[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const known = knownEmails(members, invitations);
  // What is still being typed counts as well: sending makes it a chip first.
  const draft = normalizeEmail(chips.draft);
  const emails =
    draft === '' || chips.emails.includes(draft) ? chips.emails : [...chips.emails, draft];
  const invalid = emails.filter((email) => inviteEmailProblem(email, known) === 'invalid');
  // Only these are sent: someone already a member or invited needs no new link.
  const invitable = emails.filter((email) => inviteEmailProblem(email, known) === null);

  const send = useMutation({
    mutationFn: (body: { emails: string[]; role: RoleChoice; siteIds: string[] | null }) =>
      api(endpoints.createInvitations, [workspaceId], { body }),
    onSuccess: onInvited,
    onError: (error) => {
      reportUnexpected('Inviting members failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setChips({ emails, draft: '' });
    const emailProblem =
      emails.length === 0
        ? 'Nhập ít nhất một email'
        : invalid.length > 0
          ? `Email không hợp lệ: ${invalid.join(', ')}`
          : invitable.length === 0
            ? 'Các email này đã là thành viên hoặc đang có lời mời'
            : invitable.length > INVITE_EMAILS_MAX
              ? `Mỗi lần mời tối đa ${INVITE_EMAILS_MAX} email`
              : null;
    const wholeWorkspace = option?.wholeWorkspace === true || scope === 'all';
    const sitesProblem = !wholeWorkspace && chosen.length === 0 ? 'Chọn ít nhất một site' : null;
    setEmailsError(emailProblem);
    setSitesError(sitesProblem);
    if (option === null || emailProblem !== null || sitesProblem !== null || send.isPending) {
      return;
    }
    send.mutate({ emails: invitable, role, siteIds: wholeWorkspace ? null : chosen });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running save cannot be dismissed half-way: its answer shows here.
        if (!next && send.isPending) {
          return;
        }
        onOpenChange(next);
      }}
      size="lg"
      title="Mời thành viên"
      description={`Mỗi người nhận một link riêng qua email, dùng được một lần trong ${INVITATION_VALID_DAYS} ngày.`}
      footer={
        <>
          <Button
            variant="secondary"
            disabled={send.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            form="invite-members"
            loading={send.isPending}
            disabled={option === null}
          >
            {invitable.length === 0 ? 'Gửi lời mời' : `Gửi ${invitable.length} lời mời`}
          </Button>
        </>
      }
    >
      <form id="invite-members" className={styles.form} onSubmit={submit} noValidate>
        <Field
          label="Email"
          id="invite-emails"
          help={`Cách nhau bằng dấu phẩy, khoảng trắng hoặc Enter. Tối đa ${INVITE_EMAILS_MAX} email mỗi lần.`}
          error={emailsError ?? undefined}
        >
          {(control) => (
            <EmailChips control={control} value={chips} known={known} onChange={setChips} />
          )}
        </Field>
        <RadioCardGroup<RoleChoice>
          legend="Vai trò"
          showLegend
          options={options}
          value={role}
          onChange={setRole}
          minColumnWidth={200}
        />
        {option === null ? (
          <Callout tone="warning" role="status">
            Vai trò đã chọn không còn trong workspace. Chọn một vai trò khác.
          </Callout>
        ) : null}
        {option?.wholeWorkspace === true ? (
          <p className={styles.hint}>{option.label} làm việc trên mọi site của workspace.</p>
        ) : (
          <SiteScopeFields
            name="invite-scope"
            sites={sites}
            scope={scope}
            chosen={chosen}
            error={sitesError}
            onScope={setScope}
            onChosen={setChosen}
          />
        )}
        {option === null ? null : (
          <PermissionSummary roleLabel={option.label} summary={permissionSummary(option.access)} />
        )}
        {send.isError ? (
          <Callout tone="danger" role="alert">
            {problemMessage(send.error)}
          </Callout>
        ) : null}
      </form>
    </Dialog>
  );
}
