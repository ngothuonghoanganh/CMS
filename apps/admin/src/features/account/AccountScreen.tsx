import type { SessionUser } from '@plp/contracts';
import { ArrowLeftIcon, ButtonLink, Card } from '@plp/ui';
import Link from 'next/link';
import { ChangePasswordForm } from './ChangePasswordForm';
import { ProfileForm } from './ProfileForm';
import styles from './Account.module.css';

export interface AccountScreenProps {
  user: SessionUser;
}

/**
 * "Tài khoản" (ADR-026), from the account menu of the sidebar: the email, the display name and the
 * password. One account for every workspace, so it opens at any admin address.
 */
export function AccountScreen({ user }: AccountScreenProps) {
  return (
    <div className={styles.screen}>
      <div>
        <ButtonLink
          as={Link}
          href="/"
          variant="ghost"
          size="sm"
          leadingIcon={<ArrowLeftIcon size={16} />}
        >
          Quay lại trang quản trị
        </ButtonLink>
      </div>
      <header className={styles.header}>
        <h1 className={styles.title}>Tài khoản</h1>
        <p className={styles.lead}>
          Thông tin đăng nhập của bạn, dùng chung cho mọi workspace bạn tham gia.
        </p>
      </header>
      <Card as="section" padding="lg" aria-labelledby="account-profile" className={styles.card}>
        <h2 id="account-profile" className={styles.cardTitle}>
          Thông tin cá nhân
        </h2>
        <ProfileForm user={user} />
      </Card>
      <Card as="section" padding="lg" aria-labelledby="account-password" className={styles.card}>
        <div className={styles.cardHeading}>
          <h2 id="account-password" className={styles.cardTitle}>
            Đổi mật khẩu
          </h2>
          <p className={styles.cardText}>
            Đổi xong, các thiết bị khác đang đăng nhập sẽ bị đăng xuất. Thiết bị này vẫn đăng nhập.
          </p>
        </div>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
