'use client';

import type { SessionUser } from '@plp/contracts';
import { ButtonLink } from '@plp/ui';
import { FormCard } from '../shell/FormCard';
import { SignOutButton } from './SignOutButton';
import styles from './WorkspacePicker.module.css';

export interface NotMemberProps {
  user: SessionUser;
  /** The address opened, as its host. */
  host: string;
  /** The common address's origin, where the user's own workspaces are. */
  commonOrigin: string;
}

/**
 * Screen 36: the signed-in user does not belong to the workspace at this address, or no workspace
 * has it. Both read the same, so the address tells nothing about a workspace (ADR-025).
 */
export function NotMember({ user, host, commonOrigin }: NotMemberProps) {
  return (
    <FormCard
      title="Tài khoản này không thuộc workspace ở địa chỉ này"
      description={
        <>
          Bạn đang đăng nhập bằng <strong>{user.email}</strong> và mở{' '}
          <span className={styles.address}>{host}</span>. Cần vào workspace này? Nhờ người quản lý
          của nó gửi lời mời tới email của bạn.
        </>
      }
    >
      <div className={styles.actions}>
        <ButtonLink href={`${commonOrigin}/`}>Mở workspace của tôi</ButtonLink>
        <SignOutButton>Đăng nhập bằng tài khoản khác</SignOutButton>
      </div>
    </FormCard>
  );
}
