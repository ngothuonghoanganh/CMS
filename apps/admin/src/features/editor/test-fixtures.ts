import type {
  Asset,
  ChecksResult,
  Composition,
  PageDetailResponse,
  PageSummary,
  Site,
} from '@plp/contracts';
import { createSectionInstance } from '@plp/sections/schema';
import { createEditorStore, type EditorInit, type EditorStore } from './store';

/** Shared test data for the editor specs. Never imported by application code. */

export const SITE_ID = '64b000000000000000000001';
export const PAGE_ID = '64b000000000000000000002';
export const WORKSPACE_ID = '64b000000000000000000003';
export const USER = { id: '64b000000000000000000004', name: 'Ngọc Anh' };
export const OTHER_PAGE_ID = '64b000000000000000000005';
export const RELEASE_ID = '64b000000000000000000006';
export const ASSET_ID = '64b000000000000000000007';

export const site: Site = {
  id: SITE_ID,
  workspaceId: WORKSPACE_ID,
  name: 'Smile Care',
  subdomain: 'smilecare',
  themePresetId: 'mint',
  logoAssetId: null,
  defaultShareImageAssetId: null,
  defaultOrigin: 'https://smilecare.payload.site',
  createdAt: '2026-10-01T08:00:00.000Z',
};

export const asset: Asset = {
  id: ASSET_ID,
  siteId: SITE_ID,
  url: 'https://cdn.example.com/public/doctor.jpg',
  mimeType: 'image/jpeg',
  bytes: 120_000,
  width: 1200,
  height: 900,
  alt: 'Bác sĩ tư vấn cho khách hàng',
  decorative: false,
  uploadedBy: USER,
  createdAt: '2026-10-02T08:00:00.000Z',
};

/** navbar · hero · benefits · faq · footer, with fixed ids. */
export function sampleComposition(): Composition {
  return {
    version: 1,
    sections: [
      createSectionInstance('navbar', undefined, 'navbar000001'),
      createSectionInstance('hero', undefined, 'hero00000001'),
      createSectionInstance('benefits', undefined, 'benefits0001'),
      createSectionInstance('faq', undefined, 'faq000000001'),
      createSectionInstance('footer', undefined, 'footer000001'),
    ],
  };
}

export const emptyChecks: ChecksResult = { revision: 3, blocking: [], warnings: [], passed: [] };

export function pageSummary(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    id: PAGE_ID,
    siteId: SITE_ID,
    title: 'Ưu đãi niềng răng tháng 11',
    slug: 'uu-dai-thang-11',
    goal: 'promo',
    status: { kind: 'draft', changeCount: 0, changes: [] },
    liveRelease: null,
    latestVersion: 0,
    lastPointerEvent: null,
    liveUrl: null,
    checks: { blocking: 0, warnings: 0 },
    createdBy: USER,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-24T08:00:00.000Z',
    ...overrides,
  };
}

export function pageDetail(
  composition: Composition = sampleComposition(),
  overrides: Partial<PageSummary> = {},
): PageDetailResponse {
  return {
    page: pageSummary(overrides),
    draft: {
      slug: 'uu-dai-thang-11',
      composition,
      seo: { title: '', description: '', shareImageAssetId: null, noindex: false },
      revision: 3,
      updatedAt: '2026-10-24T08:00:00.000Z',
      updatedBy: USER,
    },
    checks: emptyChecks,
  };
}

let idCounter = 0;

/** Deterministic section ids: "new000000001", "new000000002", … */
export function sequentialIds(): () => string {
  return () => {
    idCounter += 1;
    return `new${String(idCounter).padStart(9, '0')}`;
  };
}

export function makeStore(overrides: Partial<EditorInit> = {}): EditorStore {
  return createEditorStore({
    detail: pageDetail(),
    site,
    assets: [asset],
    role: 'owner',
    newId: sequentialIds(),
    ...overrides,
  });
}

export function sectionIds(store: EditorStore): string[] {
  return store.getState().draft.composition.sections.map((section) => section.id);
}

export function sectionById(store: EditorStore, id: string) {
  const section = store.getState().draft.composition.sections.find((item) => item.id === id);
  if (!section) {
    throw new Error(`No section ${id}`);
  }
  return section;
}
