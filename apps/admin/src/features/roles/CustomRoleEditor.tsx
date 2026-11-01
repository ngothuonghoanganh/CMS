'use client';

import {
  assignableRoleSchema,
  type CustomizablePermission,
  type CustomRole,
  type CustomRoleInput,
  customRoleGroups,
  customRoleInputSchema,
  endpoints,
  roleLabels,
} from '@plp/contracts';
import {
  Button,
  Callout,
  ConfirmDialog,
  Field,
  Input,
  RadioCardGroup,
  SegmentedControl,
  Select,
  Switch,
  VisuallyHidden,
} from '@plp/ui';
import { useMutation } from '@tanstack/react-query';
import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../shell/cx';
import { problemMessage, reportUnexpected } from '../shell/problem-message';
import {
  alsoChanged,
  changeOf,
  type CustomRoleDraft,
  draftOf,
  newDraft,
  type PublishLevel,
  publishLevelOf,
  rebased,
  summaryLines,
  toggled,
  withPublishLevel,
} from './custom-role-editor';
import styles from './RolesScreen.module.css';

const PUBLISH_LEVELS = [
  { value: 'off', label: 'Không' },
  { value: 'request', label: 'Yêu cầu' },
  { value: 'on', label: 'Được phép' },
] as const satisfies ReadonlyArray<{ value: PublishLevel; label: string }>;

export interface CustomRoleEditorProps {
  workspaceId: string;
  /** The role being changed; null for a new one ("Vai trò tùy chỉnh"). */
  role: CustomRole | null;
  onSaved: (role: CustomRole) => void;
  onDeleted: (role: CustomRole) => void;
  onCancel: () => void;
}

function ChangeMark({ change }: { change: 'added' | 'removed' | null }) {
  if (change === null) {
    return null;
  }
  return (
    <span className={cx(styles.change, change === 'added' ? styles.added : styles.removed)}>
      {change === 'added' ? 'Thêm' : 'Bỏ'}
    </span>
  );
}

/**
 * The editor of board 16 (ADR-024): a copy of a system role whose rows are switched on or off,
 * with what differs from that role marked and summed up before saving.
 */
export function CustomRoleEditor({
  workspaceId,
  role,
  onSaved,
  onDeleted,
  onCancel,
}: CustomRoleEditorProps) {
  const [draft, setDraft] = useState<CustomRoleDraft>(() =>
    role === null ? newDraft() : draftOf(role),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Switching a row may switch others with it: said aloud, since only colours show it.
  const [announcement, setAnnouncement] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const summaryId = useId();
  const deleteNoteId = useId();
  const holders = role === null ? 0 : role.memberCount + role.invitationCount;
  const summary = summaryLines(draft);

  const save = useMutation({
    mutationFn: (body: CustomRoleInput) =>
      role === null
        ? api(endpoints.createCustomRole, [workspaceId], { body })
        : api(endpoints.updateCustomRole, [workspaceId, role.id], { body }),
    onSuccess: onSaved,
    onError: (error) => {
      reportUnexpected('Saving a custom role failed', error);
    },
  });
  const remove = useMutation({
    mutationFn: (target: CustomRole) =>
      api(endpoints.deleteCustomRole, [workspaceId, target.id]).then(() => target),
    onSuccess: (target) => {
      setDeleteOpen(false);
      onDeleted(target);
    },
    onError: (error) => {
      reportUnexpected('Deleting a custom role failed', error);
    },
  });

  function setPermissions(
    permissions: CustomizablePermission[],
    switched: readonly CustomizablePermission[],
  ) {
    setAnnouncement(alsoChanged(draft.permissions, permissions, switched));
    setDraft({ ...draft, permissions });
  }

  /** The same rules as the API, so a refusal is said here, on its field. */
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = customRoleInputSchema.safeParse(draft);
    if (!parsed.success) {
      // The last server answer is about another attempt.
      save.reset();
      const issue = parsed.error.issues[0];
      setNameError(issue?.path[0] === 'name' ? issue.message : null);
      setFormError(issue?.path[0] === 'name' ? null : (issue?.message ?? null));
      return;
    }
    setNameError(null);
    setFormError(null);
    save.mutate(parsed.data);
  }

  return (
    <form className={styles.editor} onSubmit={submit} noValidate>
      <div className={styles.editorFields}>
        <Field label="Tên vai trò" error={nameError ?? undefined} announceMessages>
          <Input
            value={draft.name}
            maxLength={40}
            placeholder="Ví dụ: Trưởng nhóm nội dung"
            onChange={(event) => {
              setDraft({ ...draft, name: event.target.value });
            }}
          />
        </Field>
        <Field label="Bắt đầu từ" help="Đổi vai trò gốc thì các quyền bắt đầu lại từ vai trò đó.">
          <Select
            value={draft.basedOn}
            onChange={(event) => {
              const basedOn = assignableRoleSchema.safeParse(event.target.value);
              if (basedOn.success) {
                setDraft(rebased(draft, basedOn.data));
              }
            }}
          >
            {assignableRoleSchema.options.map((option) => (
              <option key={option} value={option}>
                {roleLabels[option]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {customRoleGroups.map((group) => (
        <fieldset key={group.title} className={styles.permissionGroup}>
          <legend className={styles.permissionGroupTitle}>{group.title.toUpperCase()}</legend>
          <ul className={styles.permissionRows}>
            {group.rows.map((row) => {
              const change =
                row.request === undefined
                  ? changeOf(draft, row.permission)
                  : (changeOf(draft, row.permission) ?? changeOf(draft, row.request));
              return (
                <li
                  key={row.permission}
                  className={cx(styles.permissionRow, change !== null && styles.changedRow)}
                >
                  {row.request === undefined ? (
                    <Switch
                      label={row.label}
                      className={styles.permissionSwitch}
                      checked={draft.permissions.includes(row.permission)}
                      onCheckedChange={(on) => {
                        setPermissions(toggled(draft.permissions, row.permission, on), [
                          row.permission,
                        ]);
                      }}
                    />
                  ) : (
                    <div className={styles.permissionLevel}>
                      <span className={styles.permissionLabel}>{row.label}</span>
                      <SegmentedControl<PublishLevel>
                        aria-label={row.label}
                        options={PUBLISH_LEVELS}
                        value={publishLevelOf(draft.permissions)}
                        onChange={(level) => {
                          setPermissions(withPublishLevel(draft.permissions, level), [
                            'pages.publish',
                            'pages.requestPublish',
                          ]);
                        }}
                      />
                    </div>
                  )}
                  <ChangeMark change={change} />
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <div role="status">
        <VisuallyHidden>{announcement}</VisuallyHidden>
      </div>

      <section aria-labelledby={summaryId} className={styles.summary}>
        <h3 id={summaryId} className={styles.summaryTitle}>
          Tóm tắt trước khi lưu
        </h3>
        {summary.length === 0 ? (
          <p className={styles.muted}>Giống hệt {roleLabels[draft.basedOn]}.</p>
        ) : (
          <ul className={styles.summaryList}>
            {summary.map((line) => (
              <li key={`${line.change}-${line.label}`}>
                <strong className={line.change === 'added' ? styles.added : styles.removed}>
                  {line.change === 'added' ? 'Thêm' : 'Bỏ'}
                </strong>
                : {line.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RadioCardGroup<'workspace' | 'sites'>
        legend="Phạm vi khi giao vai trò này"
        showLegend
        name="custom-role-scope"
        options={[
          { value: 'workspace', label: 'Toàn workspace', description: 'Gồm cả site tạo sau này.' },
          {
            value: 'sites',
            label: 'Chọn site khi giao',
            description: 'Chọn site khi mời hoặc đổi quyền ở màn Thành viên.',
          },
        ]}
        value={draft.wholeWorkspace ? 'workspace' : 'sites'}
        onChange={(value) => {
          setDraft({ ...draft, wholeWorkspace: value === 'workspace' });
        }}
        minColumnWidth={200}
      />

      <p className={styles.muted}>
        {holders === 0
          ? 'Chưa ai có vai trò này. Lưu không ảnh hưởng tới thành viên hiện tại.'
          : `${holders} người đang giữ vai trò này, tính cả lời mời đang chờ. Quyền mới áp dụng ngay ở thao tác kế tiếp của họ.`}
      </p>

      {formError !== null || save.isError ? (
        <Callout tone="danger" role="alert">
          {formError ?? problemMessage(save.error)}
        </Callout>
      ) : null}

      <div className={styles.editorActions}>
        {role === null ? null : (
          <>
            <Button
              variant="ghost"
              disabled={holders > 0}
              aria-describedby={holders > 0 ? deleteNoteId : undefined}
              onClick={() => {
                remove.reset();
                setDeleteOpen(true);
              }}
            >
              Xóa vai trò
            </Button>
            {holders > 0 ? (
              <span id={deleteNoteId} className={styles.muted}>
                Đổi vai trò của những người đang giữ trước khi xóa.
              </span>
            ) : null}
          </>
        )}
        <span className={styles.spacer} />
        <Button variant="secondary" disabled={save.isPending} onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" loading={save.isPending}>
          Lưu vai trò
        </Button>
      </div>

      {role === null ? null : (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          tone="danger"
          title={`Xóa vai trò ${role.name}?`}
          description="Vai trò không còn chọn được khi mời hay đổi quyền."
          confirmLabel="Xóa vai trò"
          pending={remove.isPending}
          error={remove.isError ? problemMessage(remove.error) : undefined}
          onConfirm={() => {
            remove.mutate(role);
          }}
        />
      )}
    </form>
  );
}
