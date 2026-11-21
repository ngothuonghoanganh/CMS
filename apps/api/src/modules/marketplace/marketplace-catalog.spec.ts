import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  isMarketplaceItemId,
  type MarketplaceCatalog,
  type SectionInstance,
  templateIndustryLabels,
} from '@plp/contracts';
import { compositionHasForm, getSectionDefinition, systemTemplates } from '@plp/sections/schema';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bundledMarketplaceCatalog,
  marketplaceCatalogFile,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
} from '../../../test/marketplace.js';
import { BUNDLED_MARKETPLACE_CATALOG_FILE } from '../../config/env.js';
import { loadMarketplaceCatalog } from './marketplace-catalog.js';

const files: string[] = [];

/** A catalog file for one test; removed with its directory after the file's tests. */
function file(content: unknown): string {
  const path = marketplaceCatalogFile(content);
  files.push(path);
  return path;
}

afterAll(() => {
  for (const path of files) {
    rmSync(dirname(path), { recursive: true, force: true });
  }
});

/** The bundled catalog with the first item's v1 sections changed by `change`. */
function withSections(
  change: (sections: SectionInstance[]) => SectionInstance[],
): MarketplaceCatalog {
  const catalog = bundledMarketplaceCatalog();
  const [first, ...rest] = catalog.items;
  const v1 = first?.versions[0];
  if (first === undefined || v1 === undefined) {
    throw new Error('The bundled catalog has no item');
  }
  return {
    ...catalog,
    items: [
      {
        ...first,
        versions: [
          { ...v1, composition: { ...v1.composition, sections: change(v1.composition.sections) } },
        ],
      },
      ...rest,
    ],
  };
}

function replaceSection(
  sections: SectionInstance[],
  type: SectionInstance['type'],
  change: (section: SectionInstance) => SectionInstance,
): SectionInstance[] {
  return sections.map((section) => (section.type === type ? change(section) : section));
}

describe('the bundled marketplace catalog (ADR-036)', () => {
  const catalog = loadMarketplaceCatalog(BUNDLED_MARKETPLACE_CATALOG_FILE);

  it('lists the four temporary items of ADR-036, each at v1, one of them free', () => {
    expect(
      catalog.items.map((item) => [
        item.id,
        item.name,
        item.goal,
        templateIndustryLabels[item.industry],
        item.price,
        item.status,
        item.versions.map((version) => version.version),
      ]),
    ).toEqual([
      [
        'mp-khai-truong-phong-tap',
        'Khai trương phòng tập',
        'event',
        'Thể hình',
        399_000,
        'listed',
        [1],
      ],
      [
        'mp-mo-ban-du-an-can-ho',
        'Mở bán dự án căn hộ',
        'lead',
        'Bất động sản',
        499_000,
        'listed',
        [1],
      ],
      [
        'mp-spa-uu-dai-ngay-le',
        'Spa ưu đãi ngày lễ',
        'promo',
        'Spa & làm đẹp',
        299_000,
        'listed',
        [1],
      ],
      [
        'mp-khoa-hoc-tieng-anh-tre-em',
        'Khóa học tiếng Anh trẻ em',
        'lead',
        'Giáo dục',
        0,
        'listed',
        [1],
      ],
    ]);
    expect(catalog.terms.version).toBe(1);
    expect(catalog.terms.licence.length).toBeGreaterThan(0);
  });

  it('parses with the registry exactly as written, so the file is what pages receive', () => {
    expect(catalog).toEqual(bundledMarketplaceCatalog());
  });

  it('writes whole pages: navigation first, footer last, and a way to reach the business', () => {
    for (const item of catalog.items) {
      const { sections } = item.versions[0]?.composition ?? { sections: [] };
      expect(sections[0]?.type, item.id).toBe('navbar');
      expect(sections.at(-1)?.type, item.id).toBe('footer');
      expect(
        sections.some(
          (section) => section.type === 'lead_form' || section.type === 'quick_contact',
        ),
        item.id,
      ).toBe(true);
      expect(sections.length, item.id).toBeGreaterThanOrEqual(6);
    }
    // The spa's buttons call and message on Zalo; the others take leads with the form.
    expect(
      catalog.items.map((item) =>
        compositionHasForm(item.versions[0]?.composition ?? { version: 1, sections: [] }),
      ),
    ).toEqual([true, true, false, true]);
  });

  it('has no sample copy left from the registry: every heading is the item’s own', () => {
    for (const item of catalog.items) {
      for (const section of item.versions[0]?.composition.sections ?? []) {
        const generic = getSectionDefinition(section.type).sampleContent(section.variant);
        if (typeof generic['heading'] === 'string' && generic['heading'] !== '') {
          expect(section.content['heading'], `${item.id} ${section.type}`).not.toBe(
            generic['heading'],
          );
        }
      }
    }
  });

  it('takes no id of a system template', () => {
    for (const template of systemTemplates) {
      expect(isMarketplaceItemId(template.id), template.id).toBe(false);
    }
  });
});

describe('loading a catalog file', () => {
  it('reads a catalog with drafts, withdrawn items and several versions', () => {
    const loaded = loadMarketplaceCatalog(file(testMarketplaceCatalog()));
    expect(loaded.items.map((item) => item.status)).toEqual([
      'listed',
      'listed',
      'listed',
      'listed',
      'draft',
      'withdrawn',
      'listed',
    ]);
    expect(
      loaded.items.find((item) => item.id === TWO_VERSIONS_ITEM_ID)?.versions.map((v) => v.version),
    ).toEqual([1, 2]);
  });

  it('stops the API on a file that is missing or not JSON', () => {
    expect(() => loadMarketplaceCatalog(join(dirname(file('{}')), 'missing.json'))).toThrow(
      'cannot be read as JSON',
    );
    expect(() => loadMarketplaceCatalog(file('{ "items": ['))).toThrow('cannot be read as JSON');
  });

  it('stops the API on a file that does not match, naming what is wrong', () => {
    const catalog = bundledMarketplaceCatalog();
    const path = file({
      ...catalog,
      items: [...catalog.items, { ...catalog.items[0], versions: [] }],
    });
    expect(() => loadMarketplaceCatalog(path)).toThrow(
      /Invalid marketplace catalog .*marketplace\.json/,
    );
    expect(() => loadMarketplaceCatalog(path)).toThrow(/items\[4\]\.versions/);
    expect(() => loadMarketplaceCatalog(path)).toThrow('Mã mẫu bị trùng');
  });

  it('stops the API on a composition the registry refuses, naming the item and version', () => {
    const path = file(
      withSections((sections) =>
        replaceSection(sections, 'hero', (hero) => ({ ...hero, variant: 'carousel' })),
      ),
    );
    expect(() => loadMarketplaceCatalog(path)).toThrow(
      /✖ mp-khai-truong-phong-tap v1: sections\.1\.variant: Kiểu bố cục "carousel" không có/,
    );
  });

  it('stops the API on a key the schemas would drop, or a default they would fill in', () => {
    const catalog = bundledMarketplaceCatalog();
    const [first] = catalog.items;
    const v1 = first?.versions[0];
    const [navbar, hero, ...rest] = v1?.composition.sections ?? [];
    if (first === undefined || v1 === undefined || navbar === undefined || hero === undefined) {
      throw new Error('The bundled catalog has no item with a navbar and a hero');
    }
    const { reviewPaths: _reviewPaths, ...heroWithoutReviewPaths } = hero;
    const path = file({
      ...catalog,
      items: [
        {
          ...first,
          versions: [
            {
              ...v1,
              composition: {
                ...v1.composition,
                theme: { x: 1 },
                sections: [{ ...navbar, foo: 1 }, heroWithoutReviewPaths, ...rest],
              },
            },
          ],
        },
        ...catalog.items.slice(1),
      ],
    });
    expect(() => loadMarketplaceCatalog(path)).toThrow(
      /✖ mp-khai-truong-phong-tap v1: sections\.0: differs[\s\S]*✖ mp-khai-truong-phong-tap v1: sections\.1: differs[\s\S]*✖ mp-khai-truong-phong-tap v1: theme: a composition has no such key/,
    );
  });

  it('stops the API on an image or a link to another page, and names every problem at once', () => {
    const path = file(
      withSections((sections) =>
        replaceSection(
          replaceSection(sections, 'hero', (hero) => ({
            ...hero,
            content: {
              ...hero.content,
              image: { assetId: '64b000000000000000000001', alt: 'Phòng tập', decorative: false },
            },
          })),
          'navbar',
          (navbar) => ({
            ...navbar,
            content: {
              ...navbar.content,
              cta: { label: 'Giữ chỗ', link: { kind: 'page', pageId: '64b000000000000000000002' } },
            },
          }),
        ),
      ),
    );
    expect(() => loadMarketplaceCatalog(path)).toThrow(
      /sections\.0\.content\.cta: links to a page[\s\S]*sections\.1\.content\.image: holds an image/,
    );
  });
});
