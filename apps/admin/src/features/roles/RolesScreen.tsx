'use client';

import { can, permissionGroups, type Role, roleLabels, roleSchema } from '@plp/contracts';
import { CheckIcon, VisuallyHidden } from '@plp/ui';
import { useState } from 'react';
import { cx } from '../shell/cx';
import { PageContainer, PageHeader } from '../shell/PageHeader';
import { ScrollRegion } from '../shell/ScrollRegion';
import styles from './RolesScreen.module.css';

/** Column headings of the matrix: "Chăm sóc khách hàng" is too long for a column. */
const columnLabels: Record<Role, string> = { ...roleLabels, support: 'CSKH' };

export interface RolesScreenProps {
  workspaceName: string;
  /** Members of the workspace per role. */
  counts: Record<Role, number>;
}

/**
 * Board 16 "Vai trò & quyền": the six fixed roles with their member counts, and what each may do.
 * The matrix is the table the API enforces (ADR-020); choosing a role brings its column forward.
 */
export function RolesScreen({ workspaceName, counts }: RolesScreenProps) {
  const [focus, setFocus] = useState<Role>('editor');
  const roles = roleSchema.options;
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
                    setFocus(role);
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
          </ul>
        </nav>

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
                        <td
                          key={role}
                          className={cx(styles.cell, focus === role && styles.focused)}
                        >
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
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </ScrollRegion>
        </section>
      </div>
    </PageContainer>
  );
}
