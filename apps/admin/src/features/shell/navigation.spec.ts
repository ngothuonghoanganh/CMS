import { describe, expect, it } from 'vitest';
import { navCurrent, newPageHref, pageHref, siteNavItems } from './navigation';

const siteId = '64b000000000000000000001';
const [pages, domain, settings] = siteNavItems(siteId);

describe('siteNavItems', () => {
  it('lists the MVP A sections of a site', () => {
    expect(siteNavItems(siteId)).toEqual([
      { key: 'pages', label: 'Trang', href: `/sites/${siteId}` },
      { key: 'domain', label: 'Tên miền', href: `/sites/${siteId}/domain` },
      { key: 'settings', label: 'Cài đặt site', href: `/sites/${siteId}/settings` },
    ]);
  });
});

describe('navCurrent', () => {
  it('marks the current section page', () => {
    if (!pages || !domain || !settings) {
      throw new Error('missing nav items');
    }
    expect(navCurrent(`/sites/${siteId}`, pages)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/domain`, domain)).toBe('page');
    expect(navCurrent(`/sites/${siteId}/domain`, pages)).toBeUndefined();
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
});
