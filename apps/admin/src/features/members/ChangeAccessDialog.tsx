'use client';

import {
  type AccessGrant,
  type AccessRequest,
  type AssignableRole,
  endpoints,
  type Member,
  roleLabels,
  type Site,
} from '@plp/contracts';
import {
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  RadioCardGroup,
  Select,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import { assignableRoles, permissionSummary, siteChange } from './member-presentation';
import styles from './Members.module.css';

export interface ChangeAccessDialogProps {
  workspaceId: string;
  member: Member;
  /** Sites of the workspace. */
  sites: readonly Site[];
  /** A request being decided: the dialog starts from it and saving accepts it (ADR-021). */
  request: AccessRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (member: Member) => void;
  /** After "Gỡ khỏi workspace". */
  onRemoved: () => void;
  /** After "Từ chối" of a request. */
  onDeclined: () => void;
}

type Scope = 'all' | 'sites';

function initialRole(member: Member, request: AccessRequest | null): AssignableRole {
  if (request !== null) {
    return request.role;
  }
  // Chủ sở hữu never opens this dialog.
  return member.role === 'owner' ? 'admin' : member.role;
}

/**
 * "Đổi quyền" (board 15): the one place a member's role and sites change, whether Chủ sở hữu or
 * Quản trị changes them or Chủ sở hữu accepts a request, which may be adjusted before saving.
 */
export function ChangeAccessDialog({
  workspaceId,
  member,
  sites,
  request,
  open,
  onOpenChange,
  onSaved,
  onRemoved,
  onDeclined,
}: ChangeAccessDialogProps) {
  const [role, setRole] = useState<AssignableRole>(() => initialRole(member, request));
  const [scope, setScope] = useState<Scope>(() =>
    member.siteIds === null || request?.wholeWorkspace === true ? 'all' : 'sites',
  );
  const [chosen, setChosen] = useState<string[]>(() => member.siteIds ?? []);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const wholeWorkspace = role === 'admin' || scope === 'all';
  const grant: AccessGrant = { role, siteIds: wholeWorkspace ? null : chosen };
  const summary = permissionSummary(role);

  const save = useMutation({
    mutationFn: (body: AccessGrant) =>
      request === null
        ? api(endpoints.updateMember, [workspaceId, member.userId], { body })
        : api(endpoints.acceptAccessRequest, [workspaceId, request.id], { body }),
    onSuccess: onSaved,
    onError: (error) => {
      reportUnexpected('Saving a member’s access failed', error);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(endpoints.removeMember, [workspaceId, member.userId]),
    onSuccess: () => {
      setRemoveOpen(false);
      onRemoved();
    },
    onError: (error) => {
      reportUnexpected('Removing a member failed', error);
    },
  });
  const decline = useMutation({
    mutationFn: (id: string) => api(endpoints.declineAccessRequest, [workspaceId, id]),
    onSuccess: onDeclined,
    onError: (error) => {
      reportUnexpected('Declining an access request failed', error);
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wholeWorkspace && chosen.length === 0) {
      setSitesError('Chọn ít nhất một site');
      return;
    }
    setSitesError(null);
    save.mutate(grant);
  }

  const busy = save.isPending || remove.isPending || decline.isPending;
  const failure = save.error ?? decline.error;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title={`Quyền của ${member.name}`}
        description={member.email}
        footerStart={
          request === null ? (
            <Button
              variant="ghost"
              className={styles.dangerButton}
              disabled={busy}
              onClick={() => {
                setRemoveOpen(true);
              }}
            >
              Gỡ khỏi workspace
            </Button>
          ) : (
            <Button
              variant="ghost"
              className={styles.dangerButton}
              loading={decline.isPending}
              disabled={busy}
              onClick={() => {
                decline.mutate(request.id);
              }}
            >
              Từ chối
            </Button>
          )
        }
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Hủy
            </Button>
            <Button type="submit" form="change-access" loading={save.isPending} disabled={busy}>
              {request === null ? 'Lưu quyền' : 'Chấp nhận và lưu quyền'}
            </Button>
          </>
        }
      >
        <form id="change-access" className={styles.form} onSubmit={submit} noValidate>
          {request === null ? null : (
            <Callout tone="info" title="Yêu cầu đổi quyền">
              {member.name} đang là {roleLabels[request.current.role]} và xin làm{' '}
              {roleLabels[request.role]}
              {request.wholeWorkspace ? ' trên toàn workspace' : ''}, gửi lúc{' '}
              {formatDateTime(request.createdAt)}.
              {request.note === '' ? null : <span className={styles.note}>“{request.note}”</span>}
              Bạn có thể chỉnh vai trò và site trước khi lưu.
            </Callout>
          )}
          <Field label="Vai trò" id="change-access-role">
            <Select
              value={role}
              onChange={(event) => {
                const next = assignableRoles.find((option) => option.value === event.target.value);
                if (next !== undefined) {
                  setRole(next.value);
                }
              }}
            >
              {assignableRoles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {role === 'admin' ? (
            <p className={styles.hint}>Quản trị làm việc trên mọi site của workspace.</p>
          ) : (
            <SiteScopeFields
              name="change-access-scope"
              sites={sites}
              scope={scope}
              chosen={chosen}
              before={member.siteIds}
              error={sitesError}
              onScope={setScope}
              onChosen={setChosen}
            />
          )}
          <PermissionSummary roleLabel={roleLabels[role]} summary={summary} />
          {failure !== null ? (
            <Callout tone="danger" role="alert">
              {problemMessage(failure)}
            </Callout>
          ) : null}
        </form>
      </Dialog>
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        tone="danger"
        title={`Gỡ ${member.name} khỏi workspace?`}
        description="Họ mất quyền vào mọi site của workspace ngay. Trang, bản nháp và lead họ đã làm vẫn giữ nguyên."
        confirmLabel="Gỡ khỏi workspace"
        pending={remove.isPending}
        error={remove.isError ? problemMessage(remove.error) : undefined}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </>
  );
}

export interface SiteScopeFieldsProps {
  name: string;
  sites: readonly Site[];
  scope: Scope;
  chosen: readonly string[];
  /** The member's sites before the change, for "Sẽ thêm" / "Sẽ gỡ"; undefined for a new member. */
  before?: readonly string[] | null | undefined;
  error: string | null;
  onScope: (scope: Scope) => void;
  onChosen: (siteIds: string[]) => void;
}

/** "Phạm vi": the whole workspace, sites created later included, or the sites chosen. */
export function SiteScopeFields({
  name,
  sites,
  scope,
  chosen,
  before,
  error,
  onScope,
  onChosen,
}: SiteScopeFieldsProps) {
  const errorId = `${name}-error`;
  return (
    <div className={styles.scope}>
      <RadioCardGroup<Scope>
        legend="Phạm vi"
        showLegend
        name={name}
        options={[
          { value: 'all', label: 'Toàn workspace', description: 'Gồm cả site tạo sau này.' },
          { value: 'sites', label: 'Chỉ các site được chọn' },
        ]}
        value={scope}
        onChange={onScope}
        minColumnWidth={200}
      />
      {scope === 'sites' ? (
        <fieldset
          className={styles.siteFieldset}
          aria-describedby={error === null ? undefined : errorId}
        >
          <legend className={styles.srOnly}>Site được vào</legend>
          <ul className={styles.siteList}>
            {sites.map((site) => {
              const change = before === undefined ? null : siteChange(site.id, before, chosen);
              return (
                <li key={site.id} className={styles.siteRow}>
                  <Checkbox
                    label={site.name}
                    checked={chosen.includes(site.id)}
                    onChange={(event) => {
                      onChosen(
                        event.target.checked
                          ? [...chosen, site.id]
                          : chosen.filter((id) => id !== site.id),
                      );
                    }}
                  />
                  {change === null ? null : (
                    <span className={change === 'add' ? styles.willAdd : styles.willRemove}>
                      {change === 'add' ? 'Sẽ thêm' : 'Sẽ gỡ'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}
      {error === null ? null : (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Biên tập được / Không được": what the role allows, from the table the API enforces. */
export function PermissionSummary({
  roleLabel,
  summary,
}: {
  roleLabel: string;
  summary: { allowed: string[]; denied: string[] };
}) {
  return (
    <div className={styles.summary}>
      <div>
        <span className={styles.summaryTitle}>{roleLabel} được</span>
        <ul className={styles.summaryList}>
          {summary.allowed.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
      {summary.denied.length === 0 ? null : (
        <div>
          <span className={styles.summaryTitle}>Không được</span>
          <ul className={styles.summaryList}>
            {summary.denied.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
