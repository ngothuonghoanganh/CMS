'use client';

import type { SessionUser } from '@plp/contracts';
import { ButtonLink, Card, LockIcon } from '@plp/ui';
import { SignOutButton } from './SignOutButton';
import addressStyles from './address.module.css';
import styles from './NotMember.module.css';

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
    <Card as="section" padding="lg" aria-labelledby="not-member-title" className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        <LockIcon size={22} />
      </span>
      <div className={styles.text}>
        <h1 id="not-member-title" className={styles.title}>
          Tài khoản này không thuộc workspace ở địa chỉ này
        </h1>
        <p className={styles.paragraph}>
          Bạn đang đăng nhập bằng <strong>{user.email}</strong> và mở{' '}
          <span className={addressStyles.address}>{host}</span>.
        </p>
        <p className={styles.paragraph}>
          Cần vào workspace này? Nhờ người quản lý của nó gửi lời mời tới email của bạn.
        </p>
      </div>
      <div className={styles.actions}>
        <ButtonLink href={`${commonOrigin}/`}>Mở workspace của tôi</ButtonLink>
        <SignOutButton>Đăng nhập bằng tài khoản khác</SignOutButton>
      </div>
    </Card>
  );
}
