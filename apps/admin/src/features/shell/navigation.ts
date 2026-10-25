/** Site sections in the sidebar. "Hiệu quả" comes with a later MVP B slice. */
export type SiteNavKey = 'pages' | 'leads' | 'domain' | 'privacy' | 'settings';

export interface SiteNavItem {
  key: SiteNavKey;
  label: string;
  href: string;
}

export function siteHref(siteId: string): string {
  return `/sites/${encodeURIComponent(siteId)}`;
}

export function siteNavItems(siteId: string): SiteNavItem[] {
  const base = siteHref(siteId);
  return [
    { key: 'pages', label: 'Trang', href: base },
    { key: 'leads', label: 'Leads', href: leadsHref(siteId) },
    { key: 'domain', label: 'Tên miền', href: `${base}/domain` },
    { key: 'privacy', label: 'Dữ liệu & đồng ý', href: privacyHref(siteId) },
    { key: 'settings', label: 'Cài đặt site', href: `${base}/settings` },
  ];
}

/** The lead inbox (ADR-018), optionally with filters such as `?status=new&range=all`. */
export function leadsHref(siteId: string, search = ''): string {
  return `${siteHref(siteId)}/leads${search}`;
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
export function navCurrent(pathname: string, item: SiteNavItem): 'page' | 'true' | undefined {
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

/** "Tạo trang" (goal-based page creation). */
export function newPageHref(siteId: string): string {
  return `${siteHref(siteId)}/pages/new`;
}
