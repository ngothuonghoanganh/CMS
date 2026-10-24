'use client';

import { type Membership, roleLabels, type SessionUser, type Site } from '@plp/contracts';
import {
  Avatar,
  ChevronUpDownIcon,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  FileIcon,
  GlobeIcon,
  type IconComponent,
  LogoutIcon,
  PlusIcon,
  SettingsIcon,
  VisuallyHidden,
} from '@plp/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { hostOf } from '../../lib/site-url';
import { Brand } from './Brand';
import { navCurrent, siteHref, siteNavItems, type SiteNavKey } from './navigation';
import { siteInitial, siteTileStyle } from './site-tile';
import { useLogout } from './use-logout';
import { workspacePreferenceCookie } from './workspace-preference';
import styles from './Sidebar.module.css';

const navIcons: Record<SiteNavKey, IconComponent> = {
  pages: FileIcon,
  domain: GlobeIcon,
  settings: SettingsIcon,
};

export interface SidebarProps {
  user: SessionUser;
  memberships: readonly Membership[];
  /** The user's membership in the workspace of the current site. */
  membership: Membership;
  site: Site;
  /** Sites of the current workspace. */
  sites: readonly Site[];
  pageCount: number;
  /** Called before navigating, so the mobile drawer can close. */
  onNavigate?: (() => void) | undefined;
}

function SiteTile({ site }: { site: Site }) {
  return (
    <span className={styles.siteTile} style={siteTileStyle(site)} aria-hidden="true">
      {siteInitial(site)}
    </span>
  );
}

/** Main navigation of a site: brand, workspace and site switchers, sections and the account. */
export function Sidebar({
  user,
  memberships,
  membership,
  site,
  sites,
  pageCount,
  onNavigate,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const workspace = membership.workspace;

  function go(href: string) {
    onNavigate?.();
    router.push(href);
  }

  return (
    <nav aria-label="Điều hướng chính" className={styles.sidebar}>
      <div className={styles.brand}>
        <Brand />
      </div>

      <DropdownMenu
        align="start"
        trigger={
          <button
            type="button"
            className={styles.workspaceButton}
            aria-label={`Đổi workspace — hiện tại: ${workspace.name}`}
          >
            <Avatar name={workspace.name} shape="square" />
            <span className={styles.stack}>
              <span className={styles.caption}>Workspace</span>
              <span className={styles.workspaceName}>{workspace.name}</span>
            </span>
            <span className={styles.chevron}>
              <ChevronUpDownIcon size={16} />
            </span>
          </button>
        }
      >
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={workspace.id}
          onValueChange={(workspaceId) => {
            if (workspaceId === workspace.id) {
              return;
            }
            // A UI preference only; the API checks membership on every request.
            document.cookie = workspacePreferenceCookie(workspaceId);
            go('/');
          }}
        >
          {memberships.map((item) => (
            <DropdownMenuRadioItem key={item.workspace.id} value={item.workspace.id}>
              {item.workspace.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenu>

      <div className={styles.siteGroup}>
        <span className={styles.groupLabel} aria-hidden="true">
          SITE KHÁCH HÀNG
        </span>
        <DropdownMenu
          align="start"
          trigger={
            <button
              type="button"
              className={styles.siteButton}
              aria-label={`Đổi site — hiện tại: ${site.name}`}
            >
              <SiteTile site={site} />
              <span className={styles.stack}>
                <span className={styles.siteName}>{site.name}</span>
                <span className={styles.siteHost}>{hostOf(site.defaultOrigin)}</span>
              </span>
              <span className={styles.chevron}>
                <ChevronUpDownIcon size={16} />
              </span>
            </button>
          }
        >
          <DropdownMenuLabel>Site khách hàng</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={site.id}
            onValueChange={(siteId) => {
              if (siteId !== site.id) {
                go(siteHref(siteId));
              }
            }}
          >
            {sites.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                <span className={styles.menuSiteName}>{item.name}</span>
                <span className={styles.menuSiteHost}>{hostOf(item.defaultOrigin)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {membership.role === 'owner' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<PlusIcon size={18} />}
                onSelect={() => {
                  go(`/sites/new?workspace=${encodeURIComponent(workspace.id)}`);
                }}
              >
                Tạo site mới
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenu>
      </div>

      <ul className={styles.navList}>
        {siteNavItems(site.id).map((item) => {
          const Icon = navIcons[item.key];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={navCurrent(pathname, item)}
                className={styles.navLink}
                {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              >
                <Icon size={18} />
                <span className={styles.navLabel}>{item.label}</span>
                {item.key === 'pages' ? (
                  <>
                    {' '}
                    <span className={styles.navCount}>
                      {pageCount} <VisuallyHidden>trang</VisuallyHidden>
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.account}>
        <DropdownMenu
          align="start"
          side="top"
          trigger={
            <button type="button" className={styles.accountButton}>
              <Avatar name={user.name} />
              <span className={styles.stack}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userRole}>{roleLabels[membership.role]}</span>
              </span>
              <span className={styles.chevron}>
                <ChevronUpDownIcon size={16} />
              </span>
            </button>
          }
        >
          <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
          <DropdownMenuItem
            icon={<LogoutIcon size={18} />}
            disabled={logout.isPending}
            onSelect={() => {
              logout.mutate();
            }}
          >
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </nav>
  );
}
