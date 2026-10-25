import type { HistoryEntry, HistoryResponse, PageSummary, ReleaseSummary } from '@plp/contracts';
import { pageFixture, SITE_ID } from '../dashboard/test-fixtures';

// Shared by the history specs only.

export const PAGE_ID = '64b000000000000000000101';
export const ngocAnh = { id: '64b0000000000000000000c1', name: 'Ngọc Anh' };

export function releaseId(version: number): string {
  return `64b0000000000000000002${String(version).padStart(2, '0')}`;
}

export function releaseFixture(version: number, overrides: Partial<ReleaseSummary> = {}) {
  return {
    id: releaseId(version),
    pageId: PAGE_ID,
    version,
    slug: 'uu-dai-thang-11',
    note: `Ghi chú v${version}`,
    changeSummary: [{ kind: 'modified' as const, label: 'Sửa: Hero', sectionId: 'hero00000001' }],
    sourceRevision: version * 2,
    createdBy: ngocAnh,
    createdAt: `2026-10-${String(10 + version).padStart(2, '0')}T02:40:00.000Z`,
    ...overrides,
  } satisfies ReleaseSummary;
}

export function releaseEntry(version: number): HistoryEntry {
  return { kind: 'release', release: releaseFixture(version) };
}

/** A page whose v12 is live with 4 unpublished changes. */
export function historyPage(overrides: Partial<PageSummary> = {}): PageSummary {
  return pageFixture({
    id: PAGE_ID,
    siteId: SITE_ID,
    status: { kind: 'live_with_changes', changeCount: 4, changes: [] },
    liveRelease: {
      id: releaseId(12),
      version: 12,
      slug: 'uu-dai-thang-11',
      publishedAt: '2026-10-24T08:02:00.000Z',
    },
    latestVersion: 12,
    ...overrides,
  });
}

export function historyFixture(
  items: HistoryEntry[],
  overrides: Partial<HistoryResponse> = {},
): HistoryResponse {
  return {
    items,
    nextCursor: null,
    liveReleaseId: releaseId(12),
    releaseCount: items.filter((item) => item.kind === 'release').length,
    ...overrides,
  };
}
