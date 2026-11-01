'use client';

import { type Membership, type SessionUser, workspaceOrigin } from '@plp/contracts';
import { Avatar, ButtonLink } from '@plp/ui';
import { FormCard } from '../shell/FormCard';
import { membershipLabel } from '../shell/Sidebar';
import { SignOutButton } from './SignOutButton';
import styles from './WorkspacePicker.module.css';

export interface WorkspacePickerProps {
  user: SessionUser;
  memberships: readonly Membership[];
  /** `ADMIN_WORKSPACE_ORIGIN_TEMPLATE`: each workspace opens at its own address (ADR-025). */
  template: string;
}

/**
 * Screen 35, at the common address: the workspaces of a user who belongs to several, each opening
 * at its own address; or the user belongs to none.
 */
export function WorkspacePicker({ user, memberships, template }: WorkspacePickerProps) {
  if (memberships.length === 0) {
    return (
      <FormCard
        title="Tài khoản này chưa thuộc workspace nào"
        description="Khi được mời, bạn nhận email có link tham gia. Nếu vừa bị gỡ khỏi một workspace, hãy nhờ người quản lý mời lại."
      >
        <div className={styles.actions}>
          <SignOutButton />
        </div>
      </FormCard>
    );
  }
  return (
    <FormCard
      title="Chọn workspace"
      description="Mỗi workspace có địa chỉ riêng và dữ liệu riêng. Bạn mở workspace nào thì làm việc ở địa chỉ của nó; đã đăng nhập ở đây thì không phải đăng nhập lại."
      footer={
        <>
          Thiếu một workspace? Nhờ người quản lý của workspace đó gửi lời mời tới{' '}
          <strong>{user.email}</strong>.
        </>
      }
    >
      <ul className={styles.list}>
        {memberships.map((membership) => {
          const { workspace } = membership;
          const origin = workspaceOrigin(template, workspace.slug);
          return (
            <li key={workspace.id} className={styles.item}>
              <Avatar name={workspace.name} shape="square" />
              <span className={styles.text}>
                <span className={styles.name}>{workspace.name}</span>
                <span className={styles.access}>{membershipLabel(membership)}</span>
                <span className={styles.address}>{new URL(origin).host}</span>
              </span>
              <ButtonLink href={`${origin}/`} aria-label={`Mở ${workspace.name}`}>
                Mở
              </ButtonLink>
            </li>
          );
        })}
      </ul>
      <div className={styles.actions}>
        <SignOutButton variant="ghost" />
      </div>
    </FormCard>
  );
}
