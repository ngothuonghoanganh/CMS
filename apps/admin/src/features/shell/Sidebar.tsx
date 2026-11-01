'use client';

import {
  can,
  type LeadCounts,
  type Membership,
  roleLabels,
  type SessionUser,
  type Site,
} from '@plp/contracts';
import {
  Avatar,
  Badge,
  ButtonLink,
  ChartBarIcon,
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
  InboxIcon,
  LockIcon,
  LogoutIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
  VisuallyHidden,
} from '@plp/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { AccessRequestDialog } from '../members/AccessRequestDialog';
import { loadPage } from '../../lib/page-load';
import { hostOf } from '../../lib/site-url';
import { newLeadsBadge } from '../leads/lead-presentation';
import { useLeadCounts } from '../leads/queries';
import { Brand } from './Brand';
import {
  type NavItem,
  navCurrent,
  newLeadsHref,
  siteHref,
  siteNavItems,
  type SiteNavKey,
  workspaceNavItems,
  type WorkspaceNavKey,
} from './navigation';
import { leaveScreen } from './screen-leave';
import { siteInitial, siteTileStyle } from './site-tile';
import { useLogout } from './use-logout';
import { workspacePreferenceCookie } from './workspace-preference';
import styles from './Sidebar.module.css';

const navIcons: Record<SiteNavKey | WorkspaceNavKey, IconComponent> = {
  pages: FileIcon,
  leads: InboxIcon,
  analytics: ChartBarIcon,
  domain: GlobeIcon,
  privacy: ShieldCheckIcon,
  settings: SettingsIcon,
  members: UsersIcon,
  roles: LockIcon,
};

export interface SidebarProps {
  user: SessionUser;
  memberships: readonly Membership[];
  /** The user's membership in the workspace of the current site. */
  membership: Membership;
  /** The site of the frame; null on a workspace screen of a workspace without a site yet. */
  site: Site | null;
  /** Sites of the current workspace the user may open. */
  sites: readonly Site[];
  pageCount: number;
  /**
   * Lead counts the server loaded; the badge then follows changes made in the inbox. Null for
   * roles that do not see leads (ADR-020).
   */
  leadCounts: LeadCounts | null;
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

/** "Chủ sở hữu", or "Biên tập · 2 site" for a member kept to some sites. */
export function membershipLabel(membership: Membership): string {
  const role = roleLabels[membership.role];
  return membership.siteIds === null ? role : `${role} · ${membership.siteIds.length} site`;
}

interface NavLinkProps {
  item: NavItem<SiteNavKey | WorkspaceNavKey>;
  pathname: string;
  onNavigate: (() => void) | undefined;
  /** Overrides the item's address, e.g. the new leads behind the badge. */
  href?: string;
  children?: ReactNode;
}

function NavLink({ item, pathname, onNavigate, href = item.href, children }: NavLinkProps) {
  const Icon = navIcons[item.key];
  return (
    <Link
      href={href}
      aria-current={navCurrent(pathname, item)}
      className={styles.navLink}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
    >
      <Icon size={18} />
      <span className={styles.navLabel}>{item.label}</span>
      {children}
    </Link>
  );
}

/** "Leads" with "N mới": the badge follows the inbox, and opens exactly those leads (ADR-018). */
function LeadsNavLink({
  siteId,
  leadCounts,
  ...link
}: Omit<NavLinkProps, 'href' | 'children'> & { siteId: string; leadCounts: LeadCounts }) {
  const newLeads = newLeadsBadge(useLeadCounts(siteId, leadCounts).data);
  return (
    <NavLink {...link} href={newLeads === null ? link.item.href : newLeadsHref(siteId)}>
      {newLeads === null ? null : (
        <>
          {' '}
          <Badge tone="primary" size="sm" className={styles.navBadge}>
            {newLeads}
          </Badge>
        </>
      )}
    </NavLink>
  );
}

/**
 * Main navigation (Sidebar v2): brand, the workspace switcher and its sections, the site switcher
 * and the site's sections, and the account. Each section shows only to roles that hold its
 * permission (ADR-020).
 */
export function Sidebar({
  user,
  memberships,
  membership,
  site,
  sites,
  pageCount,
  leadCounts,
  onNavigate,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const workspace = membership.workspace;
  const allowed = <Key extends string>(items: NavItem<Key>[]) =>
    items.filter((item) => can(membership.role, item.permission));
  const workspaceItems = allowed(workspaceNavItems(workspace.id));
  const canCreateSite = can(membership.role, 'sites.manage');
  // Roles that cannot change roles ask Chủ sở hữu instead (ADR-021).
  const canAskForAccess = !can(membership.role, 'members.manage');
  const [requestOpen, setRequestOpen] = useState(false);
  const newSiteHref = `/sites/new?workspace=${encodeURIComponent(workspace.id)}`;

  // Code navigation leaves through the screen on display, which saves what it holds first.
  function go(href: string) {
    onNavigate?.();
    leaveScreen(() => {
      router.push(href);
      return 'leaving';
    });
  }

  function switchWorkspace(workspaceId: string) {
    onNavigate?.();
    leaveScreen(() => {
      // A UI preference only; the API checks membership on every request. Written once the user
      // really leaves: a failed save keeps them in this workspace. The screen calls this only once
      // it saved or the user chose to leave without saving, and then the browser does not ask to
      // stay (`useBeforeUnloadGuard`), so the page load below goes ahead.
      document.cookie = workspacePreferenceCookie(workspaceId);
      // A full page load rather than a client navigation: the screen on display unmounts with
      // this workspace's queries instead of fetching them again on its way out, and nothing of
      // this workspace's sites (leads, "N mới") stays in memory to show up on coming back.
      loadPage('/');
      return 'leaving';
    });
  }

  return (
    <nav aria-label="Điều hướng chính" className={styles.sidebar}>
      <div className={styles.brand}>
        <Brand />
      </div>

      <DropdownMenu
        align="start"
        trigger={
          // Named by what it shows, then what it does: a label of its own would leave out the
          // visible words, and people who speak to their computer say what they see (WCAG 2.5.3).
          <button type="button" className={styles.workspaceButton}>
            <Avatar name={workspace.name} shape="square" />
            <span className={styles.stack}>
              <span className={styles.caption}>Workspace</span>{' '}
              <span className={styles.workspaceName}>{workspace.name}</span>
            </span>
            <VisuallyHidden>, đổi workspace</VisuallyHidden>
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
            if (workspaceId !== workspace.id) {
              switchWorkspace(workspaceId);
            }
          }}
        >
          {memberships.map((item) => (
            <DropdownMenuRadioItem key={item.workspace.id} value={item.workspace.id}>
              {item.workspace.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenu>

      {workspaceItems.length === 0 ? null : (
        <div className={styles.navGroup}>
          <span className={styles.groupLabel} aria-hidden="true">
            WORKSPACE
          </span>
          <ul className={styles.navList}>
            {workspaceItems.map((item) => (
              <li key={item.key}>
                <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.siteGroup}>
        <span className={styles.groupLabel} aria-hidden="true">
          SITE KHÁCH HÀNG
        </span>
        {site === null ? (
          canCreateSite ? (
            <ButtonLink
              as={Link}
              href={newSiteHref}
              variant="secondary"
              leadingIcon={<PlusIcon size={16} />}
            >
              Tạo site mới
            </ButtonLink>
          ) : (
            <p className={styles.noSite}>Bạn chưa được giao site nào.</p>
          )
        ) : (
          <DropdownMenu
            align="start"
            trigger={
              <button type="button" className={styles.siteButton}>
                <SiteTile site={site} />
                <span className={styles.stack}>
                  <span className={styles.siteName}>{site.name}</span>{' '}
                  <span className={styles.siteHost}>{hostOf(site.publicOrigin)}</span>
                </span>
                <VisuallyHidden>, đổi site</VisuallyHidden>
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
                  <span className={styles.menuSiteHost}>{hostOf(item.publicOrigin)}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {canCreateSite ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  icon={<PlusIcon size={18} />}
                  onSelect={() => {
                    go(newSiteHref);
                  }}
                >
                  Tạo site mới
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenu>
        )}
      </div>

      {site === null ? null : (
        <ul className={styles.navList}>
          {allowed(siteNavItems(site.id)).map((item) => (
            <li key={item.key}>
              {item.key === 'leads' && leadCounts !== null ? (
                <LeadsNavLink
                  item={item}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  siteId={site.id}
                  leadCounts={leadCounts}
                />
              ) : (
                <NavLink item={item} pathname={pathname} onNavigate={onNavigate}>
                  {item.key === 'pages' ? (
                    <>
                      {' '}
                      <span className={styles.navCount}>
                        {pageCount} <VisuallyHidden>trang</VisuallyHidden>
                      </span>
                    </>
                  ) : null}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.account}>
        <DropdownMenu
          align="start"
          side="top"
          trigger={
            <button type="button" className={styles.accountButton}>
              <Avatar name={user.name} />
              <span className={styles.stack}>
                <span className={styles.userName}>{user.name}</span>{' '}
                <span className={styles.userRole}>{membershipLabel(membership)}</span>
              </span>
              <span className={styles.chevron}>
                <ChevronUpDownIcon size={16} />
              </span>
            </button>
          }
        >
          <DropdownMenuLabel>Tài khoản</DropdownMenuLabel>
          {canAskForAccess ? (
            <DropdownMenuItem
              icon={<LockIcon size={18} />}
              onSelect={() => {
                setRequestOpen(true);
              }}
            >
              Yêu cầu đổi quyền
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            icon={<LogoutIcon size={18} />}
            disabled={logout.isPending}
            onSelect={() => {
              // Saved first: once the session is gone, a save sent as the screen unmounts fails.
              leaveScreen(logout.signOut, { discardLabel: 'Đăng xuất, bỏ thay đổi' });
            }}
          >
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
      {canAskForAccess ? (
        <AccessRequestDialog
          workspaceId={workspace.id}
          role={membership.role}
          open={requestOpen}
          onOpenChange={setRequestOpen}
        />
      ) : null}
    </nav>
  );
}
