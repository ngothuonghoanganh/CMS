import {
  type MarketplaceItem,
  type MarketplaceLicence,
  sectionIdSchema,
  templateChangedProblemContextSchema,
  templateSummarySchema,
} from '@plp/contracts';
import { compositionOutline, getAtPath } from '@plp/sections/schema';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_ITEM_ID,
  FREE_ITEM_ID,
  PAID_ITEM_ID,
  testMarketplaceCatalog,
  TWO_VERSIONS_ITEM_ID,
  V2_HEADING,
  WITHDRAWN_ITEM_ID,
} from '../../../test/marketplace.js';
import { AppError } from '../../shared/errors.js';
import {
  currentVersionOf,
  itemVersionOf,
  listedItems,
} from '../marketplace/domain/marketplace-items.js';
import type { LicensedMarketplaceItem } from '../marketplace/marketplace-licences.js';
import { newSectionId } from '../pages/section-id.js';
import {
  marketplaceComposition,
  marketplaceLibrary,
  marketplaceTemplateForRef,
  marketplaceTemplateSummary,
} from './marketplace-templates.js';

const catalog = testMarketplaceCatalog();

function itemOf(id: string): MarketplaceItem {
  const item = catalog.items.find((candidate) => candidate.id === id);
  if (item === undefined) {
    throw new Error(`No item "${id}"`);
  }
  return item;
}

/** The workspace's licence of the item at `version`, as `MarketplaceLicences.heldItem` gives it. */
function held(id: string, version: number): LicensedMarketplaceItem {
  const item = itemOf(id);
  const at = itemVersionOf(item, version);
  if (at === undefined) {
    throw new Error(`No ${id} v${version}`);
  }
  const licence: MarketplaceLicence = {
    source: 'purchase',
    version,
    termsVersion: 1,
    grantedAt: '2026-11-21T08:00:00.000Z',
  };
  return { item, licence, version: at };
}

function errorOf(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an AppError');
}

function heroHeading(composition: { sections: { type: string; content: unknown }[] }): unknown {
  const hero = composition.sections.find((section) => section.type === 'hero');
  return hero === undefined ? undefined : getAtPath(hero.content, 'heading');
}

describe('a marketplace item as a library card', () => {
  it('is a template of the source “marketplace” at the version given, for every site', () => {
    const { item, version } = held(TWO_VERSIONS_ITEM_ID, 1);
    const card = marketplaceTemplateSummary(item, version, true);
    expect(templateSummarySchema.parse(card)).toEqual(card);
    expect(card).toEqual({
      id: TWO_VERSIONS_ITEM_ID,
      source: 'marketplace',
      version: 1,
      // Midnight UTC of the day the version was released, as a system template's.
      updatedAt: '2026-10-01T00:00:00.000Z',
      name: 'Mẫu có hai phiên bản',
      description: item.description,
      goal: item.goal,
      industry: item.industry,
      hasForm: true,
      sections: compositionOutline(version.composition),
      siteIds: null,
      marketplace: { owned: true, price: 150_000 },
    });
  });

  it('says a free item is free, and an item not held is not owned', () => {
    const free = itemOf(FREE_ITEM_ID);
    expect(marketplaceTemplateSummary(free, currentVersionOf(free), false).marketplace).toEqual({
      owned: false,
      price: 0,
    });
  });
});

describe('the marketplace part of the library', () => {
  it('lists the items held at their licence’s version, then those on sale not held', () => {
    const library = marketplaceLibrary(
      [held(WITHDRAWN_ITEM_ID, 1), held(TWO_VERSIONS_ITEM_ID, 1)],
      listedItems(catalog),
    );
    expect(library.map(({ id, version, marketplace }) => [id, version, marketplace])).toEqual([
      // Newest licence first, as `heldItems` reads them; a withdrawn item stays with its holder.
      [WITHDRAWN_ITEM_ID, 1, { owned: true, price: 399_000 }],
      [TWO_VERSIONS_ITEM_ID, 1, { owned: true, price: 150_000 }],
      // Then the listed items in the catalog's order, at their current version, each once.
      [PAID_ITEM_ID, 1, { owned: false, price: 399_000 }],
      ['mp-mo-ban-du-an-can-ho', 1, { owned: false, price: 499_000 }],
      ['mp-spa-uu-dai-ngay-le', 1, { owned: false, price: 299_000 }],
      [FREE_ITEM_ID, 1, { owned: false, price: 0 }],
    ]);
    expect(library.map((card) => card.id)).not.toContain(DRAFT_ITEM_ID);
  });

  it('shows an item not held at its current version, and hides a withdrawn one', () => {
    const library = marketplaceLibrary([], listedItems(catalog));
    const twice = library.find((card) => card.id === TWO_VERSIONS_ITEM_ID);
    expect(twice).toMatchObject({ version: 2, marketplace: { owned: false } });
    expect(library.map((card) => card.id)).not.toContain(WITHDRAWN_ITEM_ID);
    expect(library.every((card) => card.source === 'marketplace')).toBe(true);
  });

  it('draws a held item from the licence’s version, not the newer one', () => {
    const [card] = marketplaceLibrary([held(TWO_VERSIONS_ITEM_ID, 1)], []);
    const v2 = itemVersionOf(itemOf(TWO_VERSIONS_ITEM_ID), 2);
    expect(card?.sections).not.toEqual(v2 === undefined ? [] : compositionOutline(v2.composition));
    expect(JSON.stringify(card?.sections)).not.toContain(V2_HEADING);
  });
});

describe('making a page from a marketplace item', () => {
  it('needs the workspace’s licence: 404 “Không tìm thấy mẫu” without one', () => {
    expect(errorOf(() => marketplaceTemplateForRef(null, { version: 1 }))).toMatchObject({
      status: 404,
      code: 'not_found',
      title: 'Không tìm thấy mẫu',
    });
  });

  it('takes the licence’s version only: 409 template_changed with it otherwise', () => {
    const licensed = held(TWO_VERSIONS_ITEM_ID, 2);
    expect(marketplaceTemplateForRef(licensed, { version: 2 })).toBe(licensed);
    const error = errorOf(() => marketplaceTemplateForRef(licensed, { version: 1 }));
    expect(error).toMatchObject({
      status: 409,
      code: 'template_changed',
      title: 'Mẫu “Mẫu có hai phiên bản” đã có phiên bản mới (v2)',
    });
    expect(templateChangedProblemContextSchema.parse(error.context)).toEqual({
      currentVersion: 2,
    });
  });

  it('copies the licence’s version with fresh section ids, parsed by the registry', () => {
    const licensed = held(TWO_VERSIONS_ITEM_ID, 1);
    const first = marketplaceComposition(licensed, newSectionId);
    const second = marketplaceComposition(licensed, newSectionId);
    const sample = licensed.version.composition;
    expect(first.sections.map(({ type, variant }) => ({ type, variant }))).toEqual(
      sample.sections.map(({ type, variant }) => ({ type, variant })),
    );
    expect(heroHeading(first)).toBe(heroHeading(sample));
    expect(heroHeading(first)).not.toBe(V2_HEADING);
    const ids = first.sections.map((section) => section.id);
    expect(ids.every((id) => sectionIdSchema.safeParse(id).success)).toBe(true);
    expect(ids.some((id) => sample.sections.some((section) => section.id === id))).toBe(false);
    // Two pages from one item never share a section id.
    expect(ids.some((id) => second.sections.some((section) => section.id === id))).toBe(false);
  });

  it('copies v2 once the licence is there', () => {
    expect(heroHeading(marketplaceComposition(held(TWO_VERSIONS_ITEM_ID, 2), newSectionId))).toBe(
      V2_HEADING,
    );
  });
});
