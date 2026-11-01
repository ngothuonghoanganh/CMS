'use client';

import { accessLabel, type Membership, type SessionUser, workspaceOrigin } from '@plp/contracts';
import { ArrowRightIcon, Avatar, BoxIcon, ButtonLink } from '@plp/ui';
import { Brand } from '../shell/Brand';
import { SignOutButton } from './SignOutButton';
import styles from './WorkspacePicker.module.css';

export interface WorkspacePickerProps {
  user: SessionUser;
  memberships: readonly Membership[];
  /** `ADMIN_WORKSPACE_ORIGIN_TEMPLATE`: each workspace opens at its own address (ADR-025). */
  template: string;
  /** The common address's origin, shown in the header. */
  commonOrigin: string;
}

/** "Chủ sở hữu · toàn workspace", or "Biên tập · 2 site" for a member kept to some sites. */
function accessLine(membership: Membership): string {
  const role = accessLabel(membership.role);
  return membership.siteIds === null
    ? `${role} · toàn workspace`
    : `${role} · ${membership.siteIds.length.toString()} site`;
}

/**
 * Screen 35, at the common address: the workspaces of a user who belongs to several, each opening
 * at its own address; or the user belongs to none.
 */
export function WorkspacePicker({
  user,
  memberships,
  template,
  commonOrigin,
}: WorkspacePickerProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerStart}>
          <Brand />
          <span className={styles.addressPill}>{new URL(commonOrigin).host}</span>
        </div>
        <div className={styles.headerEnd}>
          <Avatar name={user.name} />
          <span className={styles.person}>
            <span className={styles.personName}>{user.name}</span>
            <span className={styles.personEmail}>{user.email}</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      <main id="main-content" className={styles.main}>
        {memberships.length === 0 ? (
          <section className={styles.empty} aria-labelledby="picker-title">
            <span className={styles.emptyIcon} aria-hidden="true">
              <BoxIcon size={22} />
            </span>
            <div className={styles.intro}>
              <h1 id="picker-title" className={styles.emptyTitle}>
                Tài khoản này chưa thuộc workspace nào
              </h1>
              <p className={styles.lead}>
                Khi được mời, bạn nhận email có link tham gia. Nếu vừa bị gỡ khỏi một workspace, hãy
                nhờ người quản lý mời lại.
              </p>
            </div>
            <div>
              <SignOutButton />
            </div>
          </section>
        ) : (
          <>
            <div className={styles.intro}>
              <h1 className={styles.title}>Chọn workspace</h1>
              <p className={styles.lead}>
                Mỗi workspace có địa chỉ riêng và dữ liệu riêng. Bạn mở workspace nào thì làm việc ở
                địa chỉ của nó; đã đăng nhập ở đây thì không phải đăng nhập lại.
              </p>
            </div>
            <ul className={styles.list}>
              {memberships.map((membership) => {
                const { workspace } = membership;
                const origin = workspaceOrigin(template, workspace.slug);
                return (
                  <li key={workspace.id} className={styles.item}>
                    <Avatar name={workspace.name} shape="square" size={44} />
                    <span className={styles.text}>
                      <span className={styles.name}>{workspace.name}</span>
                      <span className={styles.access}>{accessLine(membership)}</span>
                      <span className={styles.address}>{new URL(origin).host}</span>
                    </span>
                    <ButtonLink href={`${origin}/`} aria-label={`Mở ${workspace.name}`}>
                      Mở
                      <ArrowRightIcon size={16} />
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
            <p className={styles.note}>
              Thiếu một workspace? Nhờ người quản lý của workspace đó gửi lời mời tới{' '}
              <strong>{user.email}</strong>.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
