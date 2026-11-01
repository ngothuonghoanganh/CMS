import { can, type Membership, roleLabels } from '@plp/contracts';
import { ButtonLink, LockIcon } from '@plp/ui';
import Link from 'next/link';
import { RequestAccessButton } from './RequestAccessButton';
import styles from './NoPermission.module.css';

export interface NoPermissionProps {
  /** E.g. "Bạn chưa có quyền xem vai trò & quyền". */
  title: string;
  membership: Membership;
  /** Who may, e.g. "Chủ sở hữu và Quản trị xem và đổi được phân quyền của workspace." */
  holders: string;
  /** Where to go instead, e.g. the site's pages. */
  back: { href: string; label: string };
  /** Offers "Yêu cầu đổi quyền" to roles that cannot change roles themselves (ADR-021). */
  requestAccess?: boolean | undefined;
}

/**
 * A screen the user's role may not open (board 16, "noPermission"): their role and who may,
 * instead of an error. The API refuses the same actions (ADR-020).
 */
export function NoPermission({
  title,
  membership,
  holders,
  back,
  requestAccess = false,
}: NoPermissionProps) {
  const sites = membership.siteIds === null ? '' : ` trên ${membership.siteIds.length} site`;
  return (
    <div className={styles.root}>
      <span className={styles.icon} aria-hidden="true">
        <LockIcon size={24} />
      </span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>
        Vai trò của bạn là <strong>{roleLabels[membership.role]}</strong>
        {sites}. {holders}
      </p>
      <div className={styles.actions}>
        {requestAccess && !can(membership.role, 'members.manage') ? (
          <RequestAccessButton
            workspaceId={membership.workspace.id}
            role={membership.role}
            siteLimited={membership.siteIds !== null}
          />
        ) : null}
        <ButtonLink as={Link} href={back.href} variant="secondary">
          {back.label}
        </ButtonLink>
      </div>
    </div>
  );
}
