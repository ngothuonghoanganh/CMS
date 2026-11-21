import type {
  Composition,
  MarketplaceItem,
  MarketplaceItemVersion,
  TemplateRef,
  TemplateSummary,
} from '@plp/contracts';
import {
  compositionHasForm,
  compositionOutline,
  parseComposition,
  withFreshSectionIds,
} from '@plp/sections/schema';
import { notFound } from '../../shared/errors.js';
import { currentVersionOf } from '../marketplace/domain/marketplace-items.js';
import type { LicensedMarketplaceItem } from '../marketplace/marketplace-licences.js';
import { TEMPLATE_NOT_FOUND, templateChanged } from './template-catalog.js';

/*
 * Marketplace items as templates of the library (ADR-036, amending ADR-030): a card for every item
 * the workspace holds or could get, and an item made into pages and drafts only with the
 * workspace's licence, at its version.
 */

/** Midnight UTC of the day the version was released, as a system template's `updatedAt`. */
function releasedAt(version: MarketplaceItemVersion): string {
  return new Date(`${version.releasedOn}T00:00:00.000Z`).toISOString();
}

/**
 * The library card of an item at one of its versions: the licence's for an item the workspace
 * holds, the current one for an item it does not. A licence covers every site of the workspace,
 * so the card names none (`siteIds: null`).
 */
export function marketplaceTemplateSummary(
  item: MarketplaceItem,
  version: MarketplaceItemVersion,
  owned: boolean,
): TemplateSummary {
  return {
    id: item.id,
    source: 'marketplace',
    version: version.version,
    updatedAt: releasedAt(version),
    name: item.name,
    description: item.description,
    goal: item.goal,
    industry: item.industry,
    hasForm: compositionHasForm(version.composition),
    sections: compositionOutline(version.composition),
    siteIds: null,
    marketplace: { owned, price: item.price },
  };
}

/**
 * The marketplace part of the library, after the system and the workspace templates: the items
 * the workspace holds, at their licence's version, withdrawn ones included, the newest licence
 * first; then the listed items it does not hold, at their current version, in the catalog's
 * order. Each item once, so at most the catalog's 100 items.
 */
export function marketplaceLibrary(
  held: readonly LicensedMarketplaceItem[],
  listed: readonly MarketplaceItem[],
): TemplateSummary[] {
  const heldIds = new Set(held.map(({ item }) => item.id));
  return [
    ...held.map(({ item, version }) => marketplaceTemplateSummary(item, version, true)),
    ...listed
      .filter((item) => !heldIds.has(item.id))
      .map((item) => marketplaceTemplateSummary(item, currentVersionOf(item), false)),
  ];
}

/**
 * The item a page or a draft is made from: only with the workspace's licence, else 404 "Không tìm
 * thấy mẫu" as for a template limited to other sites, and only at the licence's version, else 409
 * `template_changed` with it. A member never gets a version they did not preview.
 */
export function marketplaceTemplateForRef(
  held: LicensedMarketplaceItem | null,
  ref: Pick<TemplateRef, 'version'>,
): LicensedMarketplaceItem {
  if (held === null) {
    throw notFound(TEMPLATE_NOT_FOUND);
  }
  if (held.licence.version !== ref.version) {
    throw templateChanged(held.item.name, held.licence.version);
  }
  return held;
}

/**
 * The licence's version as a page's sections: fresh ids from `newId` (two pages from one item
 * never share one, links to a section follow it), parsed by the registry. The startup check
 * parsed every version of the catalog, so a failure here is a bug, not a user error.
 */
export function marketplaceComposition(
  { item, version }: LicensedMarketplaceItem,
  newId: () => string,
): Composition {
  const parsed = parseComposition(withFreshSectionIds(version.composition, newId));
  if (!parsed.success) {
    throw new Error(
      `Marketplace item ${item.id} v${version.version} produced an invalid composition: ${JSON.stringify(parsed.issues)}`,
    );
  }
  return parsed.composition;
}
