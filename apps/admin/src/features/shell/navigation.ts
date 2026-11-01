import type { Permission } from '@plp/contracts';

/** Site sections in the sidebar, in the order of the design. */
export type SiteNavKey = 'pages' | 'leads' | 'analytics' | 'domain' | 'privacy' | 'settings';

/** Workspace sections in the sidebar (Sidebar v2). */
export type WorkspaceNavKey = 'members' | 'roles';

export interface NavItem<Key extends string> {
  key: Key;
  label: string;
  href: string;
  /** The sidebar shows the item only to roles that hold one of these (ADR-020). */
  permissions: readonly Permission[];
}

export type SiteNavItem = NavItem<SiteNavKey>;
export type WorkspaceNavItem = NavItem<WorkspaceNavKey>;

export function siteHref(siteId: string): string {
  return `/sites/${encodeURIComponent(siteId)}`;
}

/**
 * Sections of a site. "Cài đặt site" is read-only for roles that edit pages but not the site, so
 * it shows to them; "Tên miền" only to the roles that change it, "Dữ liệu & đồng ý" also to those
 * who answer data requests there.
 */
export function siteNavItems(siteId: string): SiteNavItem[] {
  const base = siteHref(siteId);
  return [
    { key: 'pages', label: 'Trang', href: base, permissions: ['pages.view'] },
    { key: 'leads', label: 'Leads', href: leadsHref(siteId), permissions: ['leads.view'] },
    {
      key: 'analytics',
      label: 'Hiệu quả',
      href: analyticsHref(siteId),
      permissions: ['pages.view'],
    },
    { key: 'domain', label: 'Tên miền', href: `${base}/domain`, permissions: ['domains.manage'] },
    {
      key: 'privacy',
      label: 'Dữ liệu & đồng ý',
      href: privacyHref(siteId),
      // The settings, or the data requests of the people who sent a form (ADR-017, ADR-024).
      permissions: ['privacy.manage', 'personalData.manage'],
    },
    {
      key: 'settings',
      label: 'Cài đặt site',
      href: `${base}/settings`,
      permissions: ['pages.edit'],
    },
  ];
}

export function workspaceHref(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}`;
}

/** "Vai trò & quyền" (board 16, ADR-020). */
export function rolesHref(workspaceId: string): string {
  return `${workspaceHref(workspaceId)}/roles`;
}

/** "Thành viên" (board 15, ADR-021), optionally with a request open: `?request=`. */
export function membersHref(workspaceId: string, search = ''): string {
  return `${workspaceHref(workspaceId)}/members${search}`;
}

export function workspaceNavItems(workspaceId: string): WorkspaceNavItem[] {
  return [
    {
      key: 'members',
      label: 'Thành viên',
      href: membersHref(workspaceId),
      permissions: ['members.manage'],
    },
    {
      key: 'roles',
      label: 'Vai trò & quyền',
      href: rolesHref(workspaceId),
      permissions: ['members.manage'],
    },
  ];
}

/** The lead inbox (ADR-018), optionally with filters such as `?status=new&range=all`. */
export function leadsHref(siteId: string, search = ''): string {
  return `${siteHref(siteId)}/leads${search}`;
}

/** "Hiệu quả" (ADR-019), optionally with its range and page, such as `?range=30d`. */
function analyticsHref(siteId: string, search = ''): string {
  return `${siteHref(siteId)}/analytics${search}`;
}

/** One lead open in the inbox, whenever it arrived. */
export function leadHref(siteId: string, leadId: string): string {
  return leadsHref(siteId, `?lead=${encodeURIComponent(leadId)}&range=all`);
}

/**
 * The inbox the badge "N mới" and the dashboard's "chưa xử lý" open: status "Mới" of every time,
 * the leads they count (ADR-018).
 */
export function newLeadsHref(siteId: string): string {
  return leadsHref(siteId, '?status=new&range=all');
}

/** The inbox with "Nơi nhận lead" open (ADR-018): where a form's missing destination is fixed. */
export function leadRecipientsHref(siteId: string): string {
  return leadsHref(siteId, '?recipients=open');
}

/** "Dữ liệu & đồng ý" (ADR-017). */
export function privacyHref(siteId: string): string {
  return `${siteHref(siteId)}/privacy`;
}

/**
 * `aria-current` of a sidebar link: "page" on the section's own page, "true" on a page inside the
 * section (the SEO and history pages of a page belong to "Trang").
 */
export function navCurrent(pathname: string, item: NavItem<string>): 'page' | 'true' | undefined {
  if (pathname === item.href) {
    return 'page';
  }
  const section = item.key === 'pages' ? `${item.href}/pages/` : `${item.href}/`;
  return pathname.startsWith(section) ? 'true' : undefined;
}

/** Routes of one page: the editor, "SEO & chia sẻ" and "Lịch sử phiên bản". */
export function pageHref(siteId: string, pageId: string, view: 'edit' | 'seo' | 'history'): string {
  return `${siteHref(siteId)}/pages/${encodeURIComponent(pageId)}/${view}`;
}

/**
 * Where a page opens: the editor for roles that edit pages, its history otherwise, where the
 * versions and their previews are (ADR-020).
 */
export function openPageHref(siteId: string, pageId: string, canEdit: boolean): string {
  return pageHref(siteId, pageId, canEdit ? 'edit' : 'history');
}

/** "Tạo trang" (goal-based page creation). */
export function newPageHref(siteId: string): string {
  return `${siteHref(siteId)}/pages/new`;
}
