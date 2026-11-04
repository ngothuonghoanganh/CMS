'use client';

import {
  can,
  CUSTOM_ROLES_MAX,
  type CustomRole,
  endpoints,
  permissionGroups,
  type Role,
  roleLabels,
  roleSchema,
} from '@plp/contracts';
import { Button, CheckIcon, PlusIcon, useToast, VisuallyHidden } from '@plp/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../shell/cx';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { ScrollRegion } from '../shell/ScrollRegion';
import { memberQueryKeys } from '../members/queries';
import { CustomRoleEditor } from './CustomRoleEditor';
import styles from './RolesScreen.module.css';

/** Column headings of the matrix: "Chăm sóc khách hàng" is too long for a column. */
const columnLabels: Record<Role, string> = { ...roleLabels, support: 'CSKH' };

export interface RolesScreenProps {
  workspaceId: string;
  workspaceName: string;
  /** Members of the workspace per role. */
  counts: Record<Role, number>;
  /** The workspace's custom roles with who holds them (ADR-024). */
  initialCustomRoles: CustomRole[];
  loadedAt: number;
}

/** A system role brings its column forward; a custom role or a new one opens the editor. */
type Selection = { kind: 'system'; role: Role } | { kind: 'custom'; id: string } | { kind: 'new' };

/**
 * Board 16 "Vai trò & quyền": the six fixed roles with their member counts, and what each may do.
 * The matrix is the table the API enforces (ADR-020); choosing a role brings its column forward.
 * Custom roles (ADR-024) are listed after them and open the editor.
 */
export function RolesScreen({
  workspaceId,
  workspaceName,
  counts,
  initialCustomRoles,
  loadedAt,
}: RolesScreenProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selection, setSelection] = useState<Selection>({ kind: 'system', role: 'editor' });
  const roles = roleSchema.options;
  const customRoles = useQuery({
    queryKey: memberQueryKeys.customRoles(workspaceId),
    queryFn: ({ signal }) => api(endpoints.listCustomRoles, [workspaceId], { signal }),
    initialData: { items: initialCustomRoles },
    initialDataUpdatedAt: loadedAt,
  }).data.items;
  const full = customRoles.length >= CUSTOM_ROLES_MAX;
  const focus = selection.kind === 'system' ? selection.role : null;
  const editing =
    selection.kind === 'custom'
      ? (customRoles.find((role) => role.id === selection.id) ?? null)
      : null;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: memberQueryKeys.customRoles(workspaceId) });
  }
  return (
    <PageContainer>
      <PageHeader
        context={workspaceName}
        title="Vai trò & quyền"
        description="Vai trò quyết định một người được làm gì. Chủ sở hữu và Quản trị làm việc trên mọi site của workspace; các vai trò khác có thể chỉ được vào một số site."
        actions={
          <ul className={styles.legend} aria-label="Chú thích">
            <li>
              <CheckIcon size={16} strokeWidth={2.6} className={styles.yes} />
              Được phép
            </li>
            <li>
              <span className={styles.request}>Yêu cầu</span>
              Phải được duyệt
            </li>
          </ul>
        }
      />
      <div className={styles.columns}>
        <nav aria-label="Danh sách vai trò" className={styles.roleList}>
          <ul>
            {roles.map((role) => (
              <li key={role}>
                <button
                  type="button"
                  aria-pressed={focus === role}
                  className={styles.roleButton}
                  onClick={() => {
                    setSelection({ kind: 'system', role });
                  }}
                >
                  <span className={styles.roleText}>
                    <span className={styles.roleName}>{roleLabels[role]}</span>
                    <span className={styles.roleKind}>
                      {role === 'owner' ? 'Hệ thống · không sửa được' : 'Hệ thống'}
                    </span>
                  </span>
                  <span className={styles.roleCount}>
                    {counts[role]}
                    <VisuallyHidden> thành viên</VisuallyHidden>
                  </span>
                </button>
              </li>
            ))}
            {customRoles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  aria-pressed={selection.kind === 'custom' && selection.id === role.id}
                  className={styles.roleButton}
                  onClick={() => {
                    setSelection({ kind: 'custom', id: role.id });
                  }}
                >
                  <span className={styles.roleText}>
                    <span className={styles.roleName}>{role.name}</span>
                    <span className={styles.roleKind}>
                      Tùy chỉnh · từ {roleLabels[role.basedOn]}
                    </span>
                  </span>
                  <span className={styles.roleCount}>
                    {role.memberCount}
                    <VisuallyHidden> thành viên</VisuallyHidden>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.customAction}>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              className={styles.customButton}
              leadingIcon={<PlusIcon size={16} />}
              aria-pressed={selection.kind === 'new'}
              aria-describedby="custom-role-note"
              disabled={full}
              onClick={() => {
                setSelection({ kind: 'new' });
              }}
            >
              Vai trò tùy chỉnh
            </Button>
            <span id="custom-role-note" className={styles.roleKind}>
              {full
                ? `Đã đủ ${CUSTOM_ROLES_MAX} vai trò tùy chỉnh. Xóa một vai trò không dùng để tạo thêm.`
                : 'Nhân bản từ vai trò có sẵn rồi bật/tắt quyền.'}
            </span>
          </div>
        </nav>

        {selection.kind === 'system' ? null : (
          <section aria-labelledby="custom-role-title" className={styles.pane}>
            <div className={styles.paneHead}>
              <h2 id="custom-role-title" className={styles.paneTitle}>
                {editing === null ? 'Vai trò mới' : `Vai trò: ${editing.name}`}
              </h2>
              <span className={styles.paneHint}>Các dòng tô màu khác với vai trò bắt đầu</span>
            </div>
            <CustomRoleEditor
              key={selection.kind === 'custom' ? selection.id : 'new'}
              workspaceId={workspaceId}
              role={editing}
              onSaved={(saved) => {
                // In the list before it is selected: the editor opens on it, not on a new role.
                queryClient.setQueryData(
                  memberQueryKeys.customRoles(workspaceId),
                  (old: { items: CustomRole[] } | undefined) => ({
                    items: [...(old?.items ?? []).filter((role) => role.id !== saved.id), saved],
                  }),
                );
                refresh();
                setSelection({ kind: 'custom', id: saved.id });
                toast({ tone: 'success', title: `Đã lưu vai trò ${saved.name}` });
              }}
              onDeleted={(deleted) => {
                refresh();
                setSelection({ kind: 'system', role: 'editor' });
                toast({ tone: 'success', title: `Đã xóa vai trò ${deleted.name}` });
              }}
              onCancel={() => {
                setSelection({ kind: 'system', role: 'editor' });
              }}
            />
          </section>
        )}

        {focus === null ? null : (
          <section aria-labelledby="matrix-title" className={styles.pane}>
            <div className={styles.paneHead}>
              <h2 id="matrix-title" className={styles.paneTitle}>
                So sánh quyền của {roles.length} vai trò
              </h2>
              <span className={styles.paneHint}>
                Đang làm nổi {roleLabels[focus]} · vai trò hệ thống không sửa được
              </span>
            </div>
            <ScrollRegion label="Ma trận quyền theo vai trò">
              <table className={styles.matrix}>
                <caption className={styles.caption}>Ma trận quyền theo vai trò</caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.permissionHead}>
                      QUYỀN
                    </th>
                    {roles.map((role) => (
                      <th
                        key={role}
                        scope="col"
                        abbr={roleLabels[role]}
                        className={cx(styles.roleHead, focus === role && styles.focused)}
                      >
                        {columnLabels[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                {permissionGroups.map((group) => (
                  <tbody key={group.title}>
                    <tr>
                      <th scope="rowgroup" colSpan={roles.length + 1} className={styles.groupHead}>
                        {group.title.toUpperCase()}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.permission}>
                        <th scope="row" className={styles.permission}>
                          {row.label}
                        </th>
                        {roles.map((role) => (
                          <td key={role} className={styles.cell}>
                            <span className={cx(styles.mark, focus === role && styles.focused)}>
                              {can(role, row.permission) ? (
                                <>
                                  <CheckIcon size={18} strokeWidth={2.4} className={styles.yes} />
                                  <VisuallyHidden>Được phép</VisuallyHidden>
                                </>
                              ) : row.request !== undefined && can(role, row.request) ? (
                                <span className={styles.request}>
                                  Yêu cầu
                                  <VisuallyHidden> (phải được duyệt)</VisuallyHidden>
                                </span>
                              ) : (
                                <>
                                  <span aria-hidden="true" className={styles.no}>
                                    –
                                  </span>
                                  <VisuallyHidden>Không</VisuallyHidden>
                                </>
                              )}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </ScrollRegion>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
