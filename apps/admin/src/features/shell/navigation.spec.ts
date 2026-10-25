import { describe, expect, it } from 'vitest';
import {
  leadRecipientsHref,
  leadsHref,
  navCurrent,
  newLeadsHref,
  newPageHref,
  pageHref,
  siteNavItems,
} from './navigation';

const siteId = '64b000000000000000000001';
const [pages, leads, analytics, domain, privacy, settings] = siteNavItems(siteId);

describe('siteNavItems', () => {
  it('lists the sections of a site in the order of the design', () => {
    expect(siteNavItems(siteId)).toEqual([
      { key: 'pages', label: 'Trang', href: `/sites/${siteId}` },
      { key: 'leads', label: 'Leads', href: `/sites/${siteId}/leads` },
      { key: 'analytics', label: 'Hiệu quả', href: `/sites/${siteId}/analytics` },
      { key: 'domain', label: 'Tên miền', href: `/sites/${siteId}/domain` },
      { key: 'privacy', label: 'Dữ liệu & đồng ý', href: `/sites/${siteId}/privacy` },
      { key: 'settings', label: 'Cài đặt site', href: `/sites/${siteId}/settings` },
    ]);
  });
});

describe('navCurrent', () => {
  it('marks the current section page', () => {
    if (!pages || !leads || !analytics || !domain || !privacy || !settings) {
      throw new Error('missing nav items');
    }
    expect(navCurrent(`/sites/${siteId}`, pages)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/leads`, leads)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/analytics`, analytics)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/analytics`, leads)).toBeUndefined();
    expect(navCurrent(`/sites/${siteId}/leads`, pages)).toBeUndefined();
    expect(navCurrent(`/sites/${siteId}/domain`, domain)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/domain`, pages)).toBeUndefined();
    expect(navCurrent(`/sites/${siteId}/privacy`, privacy)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/settings`, settings)).toBe('page');
  });

  it('keeps "Trang" current on the SEO and history pages of a page', () => {
    if (!pages || !domain) {
      throw new Error('missing nav items');
    }
    expect(navCurrent(`/sites/${siteId}/pages/abc/seo`, pages)).toBe('true');
    expect(navCurrent(`/sites/${siteId}/pages/abc/history`, domain)).toBeUndefined();
    expect(navCurrent(`/sites/${siteId}0/domain`, domain)).toBeUndefined();
  });
});

describe('page routes', () => {
  it('builds the editor, SEO, history and creation links of a site', () => {
    expect(pageHref(siteId, 'p1', 'edit')).toBe(`/sites/${siteId}/pages/p1/edit`);
    expect(pageHref(siteId, 'p1', 'seo')).toBe(`/sites/${siteId}/pages/p1/seo`);
    expect(pageHref(siteId, 'p1', 'history')).toBe(`/sites/${siteId}/pages/p1/history`);
    expect(newPageHref(siteId)).toBe(`/sites/${siteId}/pages/new`);
  });

  it('opens the inbox with filters, and the new leads of every time for the badge', () => {
    expect(leadsHref(siteId, '?folder=spam')).toBe(`/sites/${siteId}/leads?folder=spam`);
    expect(newLeadsHref(siteId)).toBe(`/sites/${siteId}/leads?status=new&range=all`);
    expect(leadRecipientsHref(siteId)).toBe(`/sites/${siteId}/leads?recipients=open`);
  });
});
