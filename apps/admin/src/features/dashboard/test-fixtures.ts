import type {
  ActivityItem,
  PageListResponse,
  PageSummary,
  PointerEvent,
  Site,
} from '@plp/contracts';

// Shared by the dashboard specs only.

export const SITE_ID = '64b000000000000000000001';
export const WORKSPACE_ID = '64b0000000000000000000a1';

export const ngocAnh = { id: '64b0000000000000000000c1', name: 'Ngọc Anh' };
export const minh = { id: '64b0000000000000000000c2', name: 'Minh' };

export function siteFixture(overrides: Partial<Site> = {}): Site {
  return {
    id: SITE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Nha khoa Smile Care',
    subdomain: 'smilecare',
    themePresetId: 'mint',
    logoAssetId: null,
    defaultShareImageAssetId: null,
    defaultOrigin: 'https://smilecare.payload.site',
    createdAt: '2026-10-01T03:00:00.000Z',
    ...overrides,
  };
}

let nextId = 0;

function pageId(): string {
  nextId += 1;
  return `64b0000000000000000001${String(nextId).padStart(2, '0')}`;
}

export function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    type: 'published',
    version: 12,
    by: ngocAnh,
    at: '2026-10-24T06:02:00.000Z',
    ...overrides,
  };
}

/** A live page whose draft equals the live release. */
export function pageFixture(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    id: pageId(),
    siteId: SITE_ID,
    title: 'Ưu đãi niềng răng tháng 11',
    slug: 'uu-dai-thang-11',
    goal: 'promo',
    status: { kind: 'live', changeCount: 0, changes: [] },
    liveRelease: {
      id: '64b000000000000000000201',
      version: 12,
      slug: 'uu-dai-thang-11',
      publishedAt: '2026-10-24T06:02:00.000Z',
    },
    latestVersion: 12,
    lastPointerEvent: pointerEvent(),
    liveUrl: 'https://smilecare.payload.site/uu-dai-thang-11',
    checks: { blocking: 0, warnings: 0 },
    createdBy: minh,
    createdAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-10-24T06:00:00.000Z',
    ...overrides,
  };
}

export function draftPageFixture(overrides: Partial<PageSummary> = {}): PageSummary {
  return pageFixture({
    title: 'Webinar chăm sóc răng trẻ em',
    slug: 'webinar-tre-em',
    status: { kind: 'draft', changeCount: 0, changes: [] },
    liveRelease: null,
    latestVersion: 0,
    lastPointerEvent: null,
    liveUrl: null,
    ...overrides,
  });
}

export function pageListFixture(
  items: PageSummary[],
  overrides: Partial<PageListResponse> = {},
): PageListResponse {
  const count = (kind: PageSummary['status']['kind']) =>
    items.filter((item) => item.status.kind === kind).length;
  return {
    items,
    nextCursor: null,
    counts: {
      all: items.length,
      live: count('live'),
      live_with_changes: count('live_with_changes'),
      draft: count('draft'),
      unpublished: count('unpublished'),
    },
    attention: { pagesWithChanges: 0, pagesWithBlockingErrors: 0, firstPage: null },
    ...overrides,
  };
}

export function activityFixture(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: '64b000000000000000000301',
    type: 'page.published',
    actor: ngocAnh,
    siteId: SITE_ID,
    page: { id: '64b000000000000000000101', title: 'Ưu đãi niềng răng tháng 11' },
    data: { version: 12, fromVersion: null, toVersion: 12, revalidationFailed: false },
    reason: null,
    undoable: false,
    createdAt: '2026-10-24T06:02:00.000Z',
    ...overrides,
  };
}
