import { describe, expect, it } from 'vitest';
import { siteFixture } from '../dashboard/test-fixtures';
import { applySummary } from './apply-summary';
import { summaryFixture, versionFixtures, workspaceTemplateFixture } from './test-fixtures';
import {
  editableScope,
  initialScope,
  keptPagesNote,
  scopeLabel,
  templatesOfTab,
  usedLabel,
  versionOrigin,
  versionUsedLabel,
  withScopeSite,
} from './workspace-templates';

const smile = siteFixture();
const kitchen = siteFixture({ id: '64b000000000000000000002', name: 'Bếp Nhà Mây' });
const spa = siteFixture({ id: '64b000000000000000000003', name: 'Spa Lá Xanh' });

describe('the columns of board 19', () => {
  it('say who may use a template, by the member’s sites', () => {
    expect(scopeLabel({ kind: 'workspace' }, [smile])).toBe('Toàn workspace');
    expect(scopeLabel({ kind: 'sites', siteIds: [spa.id, smile.id] }, [smile, kitchen, spa])).toBe(
      'Spa Lá Xanh, Nha khoa Smile Care',
    );
    expect(scopeLabel({ kind: 'sites', siteIds: [] }, [smile])).toBe('Không còn site nào');
  });

  it('count the pages made from it', () => {
    expect(usedLabel(0)).toBe('Chưa dùng');
    expect(usedLabel(6)).toBe('6 trang');
  });

  it('split the templates in use from the archived ones', () => {
    const active = workspaceTemplateFixture();
    const archived = workspaceTemplateFixture({ id: '64b0000000000000000000f2', archived: true });
    expect(templatesOfTab([active, archived], false)).toEqual([active]);
    expect(templatesOfTab([active, archived], true)).toEqual([archived]);
  });
});

describe('“Sửa thông tin”', () => {
  it('starts from the sites the template is limited to that still exist', () => {
    const deleted = '64b0000000000000000000dd';
    expect(
      editableScope({ kind: 'sites', siteIds: [kitchen.id, deleted] }, [smile, kitchen]),
    ).toEqual({ kind: 'sites', siteIds: [kitchen.id] });
    expect(editableScope({ kind: 'workspace' }, [smile])).toEqual({ kind: 'workspace' });
  });
});

describe('the version history', () => {
  it('says what each version holds: its note, its page, or the version it reused', () => {
    const [v2, v1] = versionFixtures;
    if (v2 === undefined || v1 === undefined) {
      throw new Error('Two versions expected');
    }
    expect(versionOrigin(v2)).toBe('Thêm bảng so sánh mắc cài');
    expect(versionOrigin(v1)).toBe('Lưu từ trang “Niềng răng tháng 9”');
    expect(versionOrigin({ ...v1, version: 3, reusedFrom: 1 })).toBe('Dùng lại nội dung v1');
    // Saved from a site the member does not see: the API names no page.
    expect(versionOrigin({ ...v1, source: { pageId: null, pageTitle: null, kind: 'draft' } })).toBe(
      'Lưu từ một trang ở site khác',
    );
    expect(versionUsedLabel(2)).toBe('Đã tạo 2 trang');
    expect(versionUsedLabel(0)).toBe('Chưa tạo trang nào');
  });

  it('notes that pages made from earlier versions stay as they are', () => {
    expect(keptPagesNote(workspaceTemplateFixture())).toBe(
      '3 trang đã tạo từ v1–v2 giữ nguyên, không tự cập nhật.',
    );
    expect(keptPagesNote(workspaceTemplateFixture({ currentVersion: 1, usedCount: 1 }))).toBe(
      '1 trang đã tạo từ v1 giữ nguyên, không tự cập nhật.',
    );
    expect(keptPagesNote(workspaceTemplateFixture({ usedCount: 0 }))).toBeNull();
  });
});

describe('who may use a template, as the dialogs edit it', () => {
  it('starts with the page’s site, and keeps the sites checked in the member’s order', () => {
    expect(initialScope(null)).toEqual({ kind: 'workspace' });
    let scope = initialScope(spa.id);
    scope = withScopeSite(scope, smile.id, true, [smile, kitchen, spa]);
    expect(scope).toEqual({ kind: 'sites', siteIds: [smile.id, spa.id] });
    expect(withScopeSite(scope, spa.id, false, [smile, kitchen, spa])).toEqual({
      kind: 'sites',
      siteIds: [smile.id],
    });
  });
});

describe('applySummary (board 18, "Áp dụng vào trang đang sửa…")', () => {
  const template = summaryFixture('nha-khoa-uu-dai');
  const draft = {
    slug: 'uu-dai',
    composition: {
      version: 1 as const,
      sections: template.sections.slice(0, 5).map((section, index) => ({
        id: `sec${String(index).padStart(9, '0')}`,
        type: section.type,
        variant: section.variant,
        colorScheme: section.colorScheme,
        spacing: 'normal' as const,
        visibility: { desktop: true, mobile: true },
        mobileOrder: 'auto' as const,
        content: {},
        samplePaths: [],
        reviewPaths: [],
      })),
    },
    seo: { title: '', description: '', shareImageAssetId: null, noindex: false },
    revision: 4,
    updatedAt: '2026-11-01T03:00:00.000Z',
    updatedBy: { id: '64b0000000000000000000c1', name: 'Ngọc Anh' },
  };
  const live = {
    id: '64b0000000000000000000e1',
    version: 12,
    slug: 'uu-dai',
    publishedAt: '2026-10-30T03:00:00.000Z',
  };

  it('counts the sections replaced and keeps the live version for a live page', () => {
    expect(
      applySummary({ draft, page: { liveRelease: live, latestVersion: 12 } }, template),
    ).toEqual({
      replaces: '5 section hiện có trong bản nháp được thay bằng 8 section của mẫu, kèm chữ mẫu.',
      keeps: 'Trang live v12, tên trang, đường dẫn, SEO.',
      undo: {
        title: 'Hoàn tác được',
        text: 'Bằng “Quay về bản live” trong editor: bản nháp về lại bản live v12.',
        tone: 'neutral',
      },
    });
  });

  it('says when nothing brings the draft back', () => {
    const summary = applySummary(
      {
        draft: { ...draft, composition: { version: 1, sections: [] } },
        page: { liveRelease: null, latestVersion: 0 },
      },
      { ...template, source: 'workspace' },
    );
    expect(summary.replaces).toBe('Bản nháp chưa có section nào; mẫu thêm 8 section.');
    expect(summary.keeps).toBe('Tên trang, đường dẫn, SEO.');
    expect(summary.undo).toMatchObject({ title: 'Không hoàn tác được', tone: 'warning' });
    expect(
      applySummary({ draft, page: { liveRelease: null, latestVersion: 2 } }, template).undo.text,
    ).toBe('Bằng “Sao chép vào bản nháp” ở Lịch sử phiên bản, từ một bản đã xuất bản.');
  });
});
