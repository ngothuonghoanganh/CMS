import { describe, expect, it } from 'vitest';
import {
  leadRecipientsHref,
  leadsHref,
  navCurrent,
  newLeadsHref,
  newPageHref,
  openPageHref,
  pageHref,
  siteNavItems,
  templateHref,
  workspaceNavItems,
} from './navigation';

const siteId = '64b000000000000000000001';
const [pages, leads, analytics, domain, privacy, settings] = siteNavItems(siteId);

describe('siteNavItems', () => {
  it('lists the sections of a site in the order of the design', () => {
    expect(siteNavItems(siteId)).toEqual([
      { key: 'pages', label: 'Trang', href: `/sites/${siteId}`, permissions: ['pages.view'] },
      {
        key: 'leads',
        label: 'Leads',
        href: `/sites/${siteId}/leads`,
        permissions: ['leads.view'],
      },
      {
        key: 'analytics',
        label: 'Hiệu quả',
        href: `/sites/${siteId}/analytics`,
        permissions: ['pages.view'],
      },
      {
        key: 'domain',
        label: 'Tên miền',
        href: `/sites/${siteId}/domain`,
        permissions: ['domains.manage'],
      },
      {
        key: 'privacy',
        label: 'Dữ liệu & đồng ý',
        href: `/sites/${siteId}/privacy`,
        permissions: ['privacy.manage', 'personalData.manage'],
      },
      {
        key: 'settings',
        label: 'Cài đặt site',
        href: `/sites/${siteId}/settings`,
        permissions: ['pages.edit'],
      },
    ]);
  });

  it('lists the workspace sections, "Sites" and "Templates" first for every role, each behind its permission', () => {
    expect(workspaceNavItems('64b0000000000000000000aa')).toEqual([
      {
        key: 'sites',
        label: 'Sites',
        href: '/workspaces/64b0000000000000000000aa/sites',
        permissions: ['pages.view'],
      },
      {
        key: 'templates',
        label: 'Templates',
        href: '/workspaces/64b0000000000000000000aa/templates',
        permissions: ['pages.view'],
      },
      {
        key: 'members',
        label: 'Thành viên',
        href: '/workspaces/64b0000000000000000000aa/members',
        permissions: ['members.manage'],
      },
      {
        key: 'roles',
        label: 'Vai trò & quyền',
        href: '/workspaces/64b0000000000000000000aa/roles',
        permissions: ['members.manage'],
      },
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

  it('marks "Sites" on the Sites screen of the workspace only', () => {
    const [sites] = workspaceNavItems('64b0000000000000000000aa');
    if (!sites) {
      throw new Error('missing nav items');
    }
    expect(navCurrent('/workspaces/64b0000000000000000000aa/sites', sites)).toBe('page');
    expect(navCurrent('/workspaces/64b0000000000000000000aa/members', sites)).toBeUndefined();
    expect(navCurrent(`/sites/${siteId}`, sites)).toBeUndefined();
  });

  it('marks "Templates" on the library and, as a part of it, on a template', () => {
    const [, templates] = workspaceNavItems('64b0000000000000000000aa');
    if (!templates) {
      throw new Error('missing nav items');
    }
    expect(navCurrent('/workspaces/64b0000000000000000000aa/templates', templates)).toBe('page');
    expect(
      navCurrent('/workspaces/64b0000000000000000000aa/templates/nha-khoa-uu-dai', templates),
    ).toBe('true');
    expect(navCurrent('/workspaces/64b0000000000000000000aa/sites', templates)).toBeUndefined();
  });

  it('links a template, previewed for a site when one is chosen', () => {
    expect(templateHref('64b0000000000000000000aa', 'nha-khoa-uu-dai')).toBe(
      '/workspaces/64b0000000000000000000aa/templates/nha-khoa-uu-dai',
    );
    expect(templateHref('64b0000000000000000000aa', 'nha-khoa-uu-dai', siteId)).toBe(
      `/workspaces/64b0000000000000000000aa/templates/nha-khoa-uu-dai?site=${siteId}`,
    );
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

  it('opens a page in the editor for roles that edit it, in its history otherwise', () => {
    expect(openPageHref(siteId, 'p1', true)).toBe(`/sites/${siteId}/pages/p1/edit`);
    expect(openPageHref(siteId, 'p1', false)).toBe(`/sites/${siteId}/pages/p1/history`);
  });

  it('opens the inbox with filters, and the new leads of every time for the badge', () => {
    expect(leadsHref(siteId, '?folder=spam')).toBe(`/sites/${siteId}/leads?folder=spam`);
    expect(newLeadsHref(siteId)).toBe(`/sites/${siteId}/leads?status=new&range=all`);
    expect(leadRecipientsHref(siteId)).toBe(`/sites/${siteId}/leads?recipients=open`);
  });
});
