'use client';

import {
  type CreateInvitationsResponse,
  type CustomRole,
  emailSchema,
  endpoints,
  INVITATION_VALID_DAYS,
  INVITE_EMAILS_MAX,
  type RoleChoice,
  type Site,
} from '@plp/contracts';
import { Button, Callout, Dialog, Field, Input, RadioCardGroup } from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api } from '../../lib/api';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { PermissionSummary, SiteScopeFields } from './ChangeAccessDialog';
import { parseEmails, permissionSummary, roleOptions } from './member-presentation';
import styles from './Members.module.css';

export interface InviteDialogProps {
  workspaceId: string;
  sites: readonly Site[];
  /** The workspace's custom roles, offered after the system ones (ADR-024). */
  customRoles: readonly CustomRole[];
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
  open,
  onOpenChange,
  onInvited,
}: InviteDialogProps) {
  const [emailsText, setEmailsText] = useState('');
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [role, setRole] = useState<RoleChoice>('editor');
  const options = roleOptions(customRoles);
  // A custom role removed while the dialog was open is not replaced by another one.
  const option = options.find((item) => item.value === role) ?? null;
  const [scope, setScope] = useState<'all' | 'sites'>(sites.length > 1 ? 'sites' : 'all');
  const [chosen, setChosen] = useState<string[]>([]);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const emails = parseEmails(emailsText);

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
    const invalid = emails.filter((email) => !emailSchema.safeParse(email).success);
    const emailProblem =
      emails.length === 0
        ? 'Nhập ít nhất một email'
        : invalid.length > 0
          ? `Email không hợp lệ: ${invalid.join(', ')}`
          : emails.length > INVITE_EMAILS_MAX
            ? `Mỗi lần mời tối đa ${INVITE_EMAILS_MAX} email`
            : null;
    const wholeWorkspace = option?.wholeWorkspace === true || scope === 'all';
    const sitesProblem = !wholeWorkspace && chosen.length === 0 ? 'Chọn ít nhất một site' : null;
    setEmailsError(emailProblem);
    setSitesError(sitesProblem);
    if (option === null || emailProblem !== null || sitesProblem !== null || send.isPending) {
      return;
    }
    send.mutate({ emails, role, siteIds: wholeWorkspace ? null : chosen });
  }

  const count = Math.max(emails.length, 1);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
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
            Gửi {count} lời mời
          </Button>
        </>
      }
    >
      <form id="invite-members" className={styles.form} onSubmit={submit} noValidate>
        <Field
          label="Email"
          id="invite-emails"
          help="Cách nhau bằng dấu phẩy hoặc xuống dòng."
          error={emailsError ?? undefined}
        >
          <Input
            type="text"
            inputMode="email"
            autoComplete="off"
            placeholder="ten@congty.vn, nguoi-khac@congty.vn"
            value={emailsText}
            onChange={(event) => {
              setEmailsText(event.target.value);
            }}
          />
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
