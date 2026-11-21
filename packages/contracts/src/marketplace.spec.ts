import { describe, expect, it } from 'vitest';
import {
  claimMarketplaceItemRequestSchema,
  type MarketplaceCatalog,
  marketplaceCatalogSchema,
  marketplaceItemChangedProblemContextSchema,
  marketplaceItemDetailSchema,
  marketplaceLicenceListResponseSchema,
  marketplaceListResponseSchema,
  MAX_MARKETPLACE_ITEM_VERSIONS,
  MAX_MARKETPLACE_ITEMS,
  updateMarketplaceLicenceVersionRequestSchema,
} from './marketplace.js';
import {
  isMarketplaceItemId,
  MARKETPLACE_ITEM_ID_PREFIX,
  marketplaceItemIdSchema,
  systemTemplateIdSchema,
} from './templates.js';

const TERMS = {
  version: 1,
  summary: 'Không bán lại hay chia sẻ mẫu.',
  licence: ['Giấy phép thuộc workspace và phủ mọi site của nó.'],
  support: 'Hỗ trợ qua email trong giờ làm việc.',
  refund: 'Hoàn tiền theo chính sách của Payload',
};

function version(number: number, releasedOn = '2026-11-21') {
  return {
    version: number,
    releasedOn,
    note: number === 1 ? 'Phiên bản đầu tiên.' : `Có gì mới ở v${number}.`,
    composition: { version: 1, sections: [] },
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mp-khai-truong-phong-tap',
    status: 'listed',
    name: 'Khai trương phòng tập',
    description: 'Ưu đãi khai trương, lịch lớp học, huấn luyện viên và form giữ chỗ.',
    goal: 'event',
    industry: 'fitness',
    price: 399_000,
    versions: [version(1)],
    ...overrides,
  };
}

function catalog(items: unknown[], terms: unknown = TERMS) {
  return { terms, items };
}

/** The messages of a catalog that does not match, by path. */
function problems(input: unknown): Record<string, string> {
  const result = marketplaceCatalogSchema.safeParse(input);
  if (result.success) {
    return {};
  }
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('marketplace item ids (ADR-036)', () => {
  it('are "mp-" and kebab-case', () => {
    expect(marketplaceItemIdSchema.parse('mp-khai-truong-phong-tap')).toBe(
      'mp-khai-truong-phong-tap',
    );
    expect(isMarketplaceItemId('mp-spa')).toBe(true);
    for (const id of [
      'khai-truong-phong-tap',
      'mp-',
      'mp',
      'mp--spa',
      'MP-spa',
      'mp_spa',
      'mp-spa-',
      'mpspa-x',
      `mp-${'a'.repeat(58)}`,
      '64b000000000000000000001',
    ]) {
      expect(isMarketplaceItemId(id), id).toBe(false);
    }
  });

  it('still read as kebab-case template ids, told apart by their prefix', () => {
    expect(MARKETPLACE_ITEM_ID_PREFIX).toBe('mp-');
    expect(systemTemplateIdSchema.safeParse('mp-khai-truong-phong-tap').success).toBe(true);
    expect(isMarketplaceItemId('nha-khoa-uu-dai')).toBe(false);
  });
});

describe('the marketplace catalog', () => {
  it('reads the terms and the items with their versions', () => {
    const parsed: MarketplaceCatalog = marketplaceCatalogSchema.parse(
      catalog([
        item({ versions: [version(1, '2026-10-01'), version(2, '2026-10-20')] }),
        item({ id: 'mp-khoa-hoc-tieng-anh-tre-em', price: 0, status: 'draft' }),
        item({ id: 'mp-spa-uu-dai-ngay-le', status: 'withdrawn' }),
      ]),
    );
    expect(parsed.terms).toEqual(TERMS);
    expect(parsed.items.map(({ id, status, price }) => [id, status, price])).toEqual([
      ['mp-khai-truong-phong-tap', 'listed', 399_000],
      ['mp-khoa-hoc-tieng-anh-tre-em', 'draft', 0],
      ['mp-spa-uu-dai-ngay-le', 'withdrawn', 399_000],
    ]);
    expect(parsed.items[0]?.versions.map((entry) => entry.version)).toEqual([1, 2]);
  });

  it('numbers the versions of an item one after another from 1', () => {
    expect(problems(catalog([item({ versions: [version(2)] })]))).toEqual({
      'items.0.versions.0.version': 'Phiên bản phải tăng liên tiếp từ 1: ở vị trí này phải là v1',
    });
    expect(problems(catalog([item({ versions: [version(1), version(3)] })]))).toEqual({
      'items.0.versions.1.version': 'Phiên bản phải tăng liên tiếp từ 1: ở vị trí này phải là v2',
    });
    expect(problems(catalog([item({ versions: [version(1), version(1)] })]))).toHaveProperty([
      'items.0.versions.1.version',
    ]);
    expect(problems(catalog([item({ versions: [] })]))).toHaveProperty(['items.0.versions']);
    expect(problems(catalog([item({ versions: [version(1.5)] })]))).toHaveProperty([
      'items.0.versions.0.version',
    ]);
  });

  it('never releases a version before the one it follows', () => {
    expect(
      problems(catalog([item({ versions: [version(1, '2026-10-20'), version(2, '2026-10-01')] })])),
    ).toEqual({
      'items.0.versions.1.releasedOn': 'Phiên bản mới không phát hành trước phiên bản cũ',
    });
    expect(
      problems(catalog([item({ versions: [version(1, '2026-10-20'), version(2, '2026-10-20')] })])),
    ).toEqual({});
    expect(problems(catalog([item({ versions: [version(1, '20/10/2026')] })]))).toHaveProperty([
      'items.0.versions.0.releasedOn',
    ]);
    expect(problems(catalog([item({ versions: [version(1, '2026-02-30')] })]))).toHaveProperty([
      'items.0.versions.0.releasedOn',
    ]);
  });

  it('refuses an id twice', () => {
    expect(problems(catalog([item(), item({ name: 'Bản khác' })]))).toEqual({
      'items.1.id': 'Mã mẫu bị trùng',
    });
  });

  it('bounds every list: 100 items, 20 versions, 20 paragraphs of terms', () => {
    const many = Array.from({ length: MAX_MARKETPLACE_ITEMS }, (_entry, index) =>
      item({ id: `mp-mau-${index}` }),
    );
    expect(problems(catalog(many))).toEqual({});
    expect(problems(catalog([...many, item({ id: 'mp-mau-thu-101' })]))).toHaveProperty(['items']);
    const versions = Array.from({ length: MAX_MARKETPLACE_ITEM_VERSIONS + 1 }, (_entry, index) =>
      version(index + 1),
    );
    expect(problems(catalog([item({ versions: versions.slice(0, -1) })]))).toEqual({});
    expect(problems(catalog([item({ versions })]))).toHaveProperty(['items.0.versions']);
    expect(
      problems(catalog([item()], { ...TERMS, licence: Array.from({ length: 21 }, () => 'Đoạn.') })),
    ).toHaveProperty(['terms.licence']);
  });

  it('bounds the texts and refuses empty ones', () => {
    expect(problems(catalog([item({ name: 'a'.repeat(120) })]))).toEqual({});
    expect(problems(catalog([item({ name: 'a'.repeat(121) })]))).toHaveProperty(['items.0.name']);
    expect(problems(catalog([item({ name: '  ' })]))).toHaveProperty(['items.0.name']);
    expect(problems(catalog([item({ description: 'a'.repeat(301) })]))).toHaveProperty([
      'items.0.description',
    ]);
    expect(
      problems(catalog([item({ versions: [{ ...version(1), note: 'a'.repeat(201) }] })])),
    ).toHaveProperty(['items.0.versions.0.note']);
    expect(problems(catalog([item({ versions: [{ ...version(1), note: '' }] })]))).toHaveProperty([
      'items.0.versions.0.note',
    ]);
    for (const key of ['summary', 'support', 'refund'] as const) {
      expect(problems(catalog([item()], { ...TERMS, [key]: '' })), key).toHaveProperty([
        `terms.${key}`,
      ]);
    }
    expect(problems(catalog([item()], { ...TERMS, licence: [] }))).toHaveProperty([
      'terms.licence',
    ]);
    expect(problems(catalog([item()], { ...TERMS, version: 0 }))).toHaveProperty(['terms.version']);
  });

  it('takes whole đồng with VAT, 0 for free, and known statuses, goals and industries only', () => {
    expect(problems(catalog([item({ price: 0 })]))).toEqual({});
    for (const price of [-1, 399_000.5, '399000']) {
      expect(problems(catalog([item({ price })])), String(price)).toHaveProperty(['items.0.price']);
    }
    expect(problems(catalog([item({ status: 'archived' })]))).toHaveProperty(['items.0.status']);
    expect(problems(catalog([item({ goal: 'webinar' })]))).toHaveProperty(['items.0.goal']);
    expect(problems(catalog([item({ industry: 'event' })]))).toHaveProperty(['items.0.industry']);
  });

  it('refuses keys it does not know, so a misspelt field is not silently dropped', () => {
    expect(problems(catalog([item({ prices: 399_000 })]))).toHaveProperty(['items.0']);
    expect(problems({ ...catalog([item()]), plans: [] })).toHaveProperty(['']);
    expect(
      problems(catalog([item({ versions: [{ ...version(1), changelog: 'Mới' }] })])),
    ).toHaveProperty(['items.0.versions.0']);
  });

  it('checks the frame of each composition: duplicate section ids are refused', () => {
    const section = {
      id: 'mpsection01',
      type: 'faq',
      variant: 'accordion',
      colorScheme: 'light',
      spacing: 'normal',
      visibility: { desktop: true, mobile: true },
      mobileOrder: 'auto',
      content: {},
      samplePaths: [],
    };
    expect(
      problems(
        catalog([
          item({
            versions: [
              { ...version(1), composition: { version: 1, sections: [section, section] } },
            ],
          }),
        ]),
      ),
    ).toEqual({ 'items.0.versions.0.composition.sections.1.id': 'Mã section bị trùng' });
  });
});

describe('the answers of the marketplace screens', () => {
  const card = {
    id: 'mp-khai-truong-phong-tap',
    version: 1,
    releasedOn: '2026-11-21',
    name: 'Khai trương phòng tập',
    description: 'Ưu đãi khai trương.',
    goal: 'event',
    industry: 'fitness',
    price: 399_000,
    hasForm: true,
    sections: [],
    owned: false,
    popularRank: 1,
  };

  it('lists cards with the number of items the workspace holds', () => {
    expect(marketplaceListResponseSchema.parse({ items: [card], ownedCount: 0 })).toEqual({
      items: [card],
      ownedCount: 0,
    });
    expect(
      marketplaceListResponseSchema.safeParse({
        items: [{ ...card, popularRank: 0 }],
        ownedCount: 0,
      }).success,
    ).toBe(false);
  });

  it('details an item with no licence yet, or with one', () => {
    const detail = {
      ...card,
      composition: { version: 1, sections: [] },
      note: 'Phiên bản đầu tiên.',
      terms: TERMS,
      withdrawn: false,
      licence: null,
      ownerName: 'Ngọc Anh',
    };
    expect(marketplaceItemDetailSchema.parse(detail)).toEqual(detail);
    const licence = {
      source: 'free',
      version: 1,
      termsVersion: 1,
      grantedAt: '2026-11-21T08:00:00.000Z',
    };
    expect(marketplaceItemDetailSchema.parse({ ...detail, licence }).licence).toEqual(licence);
    expect(
      marketplaceItemDetailSchema.safeParse({ ...detail, licence: { ...licence, source: 'gift' } })
        .success,
    ).toBe(false);
  });
});

describe('the licences of a workspace (MP2)', () => {
  const row = {
    itemId: 'mp-mau-hai-phien-ban',
    name: 'Mẫu có hai phiên bản',
    source: 'purchase',
    version: 1,
    latestVersion: 2,
    newVersions: [{ version: 2, releasedOn: '2026-10-20', note: 'Đổi tiêu đề của Hero.' }],
    grantedAt: '2026-11-21T08:00:00.000Z',
    withdrawn: false,
    hasForm: true,
    sections: [],
    usedCount: 2,
  };

  it('claims a version under the terms the member agreed to', () => {
    expect(claimMarketplaceItemRequestSchema.parse({ version: 2, termsVersion: 1 })).toEqual({
      version: 2,
      termsVersion: 1,
    });
    for (const body of [{ version: 0, termsVersion: 1 }, { version: 1 }, { termsVersion: 1 }]) {
      expect(claimMarketplaceItemRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('updates from the version the dialog showed', () => {
    expect(updateMarketplaceLicenceVersionRequestSchema.parse({ baseVersion: 1 })).toEqual({
      baseVersion: 1,
    });
    expect(updateMarketplaceLicenceVersionRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateMarketplaceLicenceVersionRequestSchema.safeParse({ baseVersion: 1.5 }).success,
    ).toBe(false);
  });

  it('lists the items held, at most one row per item of the catalog', () => {
    expect(marketplaceLicenceListResponseSchema.parse({ items: [row] })).toEqual({
      items: [row],
    });
    expect(
      marketplaceLicenceListResponseSchema.safeParse({
        items: Array.from({ length: MAX_MARKETPLACE_ITEMS + 1 }, () => row),
      }).success,
    ).toBe(false);
    expect(
      marketplaceLicenceListResponseSchema.safeParse({ items: [{ ...row, itemId: 'nha-khoa' }] })
        .success,
    ).toBe(false);
    // "N trang đã tạo từ mẫu này không đổi" of the update dialog.
    for (const usedCount of [-1, 1.5, undefined]) {
      expect(
        marketplaceLicenceListResponseSchema.safeParse({ items: [{ ...row, usedCount }] }).success,
      ).toBe(false);
    }
  });

  it('says what the item is now when the member saw it otherwise', () => {
    expect(
      marketplaceItemChangedProblemContextSchema.parse({ version: 2, price: 0, termsVersion: 3 }),
    ).toEqual({ version: 2, price: 0, termsVersion: 3 });
  });
});
