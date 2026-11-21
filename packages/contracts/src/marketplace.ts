import { z } from 'zod';
import { vndAmountSchema } from './billing.js';
import { isoDateTimeSchema } from './common.js';
import { compositionSchema } from './composition.js';
import { pageGoalSchema } from './goals.js';
import {
  marketplaceItemIdSchema,
  templateIndustrySchema,
  templateSectionSchema,
  templateVersionSchema,
} from './templates.js';

/*
 * The template marketplace (ADR-036, boards 30–32): templates Payload writes and sells, or gives,
 * in a catalog file the API reads at startup. Its items have the shape of the system templates
 * (ADR-030) plus a price, a status and every version ever released, since a licence names one.
 */

// An item's id (`marketplaceItemIdSchema`, `isMarketplaceItemId`) is in templates.ts with the
// other sources' ids: the template library and a page's `createdFrom` name items too.

/** At most this many items in the catalog: the marketplace screen has no pagination. */
export const MAX_MARKETPLACE_ITEMS = 100;
/** At most this many versions of one item; a released version is never removed. */
export const MAX_MARKETPLACE_ITEM_VERSIONS = 20;

/**
 * `draft`: shown nowhere, 404 for everyone, written before it goes on sale. `listed`: on the
 * marketplace, to buy or claim. `withdrawn`: off the marketplace and no longer sold; a workspace
 * holding its licence still sees and uses it (MP2). An item with a licence never leaves the file.
 */
export const marketplaceItemStatuses = ['draft', 'listed', 'withdrawn'] as const;
export const marketplaceItemStatusSchema = z.enum(marketplaceItemStatuses);
export type MarketplaceItemStatus = z.infer<typeof marketplaceItemStatusSchema>;

export const marketplaceItemNameSchema = z.string().trim().min(1).max(120);
/** Under the item's name on board 31, and searched on board 30. */
export const marketplaceItemDescriptionSchema = z.string().trim().min(1).max(300);
/** "Có gì mới ở v2 · 20/10/2026". */
export const marketplaceVersionNoteSchema = z.string().trim().min(1).max(200);

/** A day, "YYYY-MM-DD": no time and no time zone, as the catalog writes it. */
export const marketplaceReleaseDateSchema = z.iso.date();

/**
 * The texts of the licence (board 31): the "Giấy phép" and "Cập nhật & hỗ trợ" cards, the refund
 * line under the price and the full terms behind "Điều khoản giấy phép". A change of any text is a
 * new `version`, which a licence records as the terms its workspace agreed to (MP2).
 */
export const marketplaceTermsSchema = z.strictObject({
  version: z.number().int().positive(),
  /** After "Dùng cho mọi site trong workspace mua." in the "Giấy phép" card. */
  summary: z.string().trim().min(1).max(300),
  /** The full terms, one paragraph each. */
  licence: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  /** After "Phiên bản mới miễn phí cho workspace đã sở hữu." in "Cập nhật & hỗ trợ". */
  support: z.string().trim().min(1).max(300),
  /** "Một lần · Đã gồm VAT · {refund}" under the price. */
  refund: z.string().trim().min(1).max(200),
});
export type MarketplaceTerms = z.infer<typeof marketplaceTermsSchema>;

/**
 * A released version: never changed or removed once in the file, since a licence names it with
 * the hash of its content (MP2). New content is a new version.
 */
export const marketplaceItemVersionSchema = z.strictObject({
  version: templateVersionSchema,
  releasedOn: marketplaceReleaseDateSchema,
  note: marketplaceVersionNoteSchema,
  /**
   * The page a new draft starts from, with sample section ids. This schema checks its frame only.
   * At startup the API also parses the file's own text of it with the section registry, refuses
   * anything the registry would change, images, links to other pages and a business's phone,
   * Zalo or web address.
   */
  composition: compositionSchema,
});
export type MarketplaceItemVersion = z.infer<typeof marketplaceItemVersionSchema>;

/** One item of the catalog file. */
export const marketplaceItemSchema = z
  .strictObject({
    id: marketplaceItemIdSchema,
    status: marketplaceItemStatusSchema,
    name: marketplaceItemNameSchema,
    description: marketplaceItemDescriptionSchema,
    goal: pageGoalSchema,
    industry: templateIndustrySchema,
    /** Whole đồng, VAT included, paid once; 0 is free. */
    price: vndAmountSchema,
    /** v1, v2, … in order: the last one is the current version. */
    versions: z.array(marketplaceItemVersionSchema).min(1).max(MAX_MARKETPLACE_ITEM_VERSIONS),
  })
  .superRefine((item, context) => {
    item.versions.forEach((version, index) => {
      if (version.version !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: `Phiên bản phải tăng liên tiếp từ 1: ở vị trí này phải là v${index + 1}`,
          path: ['versions', index, 'version'],
        });
      }
      const before = item.versions[index - 1];
      if (before !== undefined && version.releasedOn < before.releasedOn) {
        context.addIssue({
          code: 'custom',
          message: 'Phiên bản mới không phát hành trước phiên bản cũ',
          path: ['versions', index, 'releasedOn'],
        });
      }
    });
  });
export type MarketplaceItem = z.infer<typeof marketplaceItemSchema>;

/**
 * The catalog file (`apps/api/marketplace.json`, `MARKETPLACE_CATALOG_FILE`, ADR-036): the terms
 * and the items in the order board 30 lists them. The API refuses to start when it does not match.
 */
export const marketplaceCatalogSchema = z
  .strictObject({
    terms: marketplaceTermsSchema,
    items: z.array(marketplaceItemSchema).max(MAX_MARKETPLACE_ITEMS),
  })
  .superRefine((catalog, context) => {
    const seen = new Set<string>();
    catalog.items.forEach((item, index) => {
      if (seen.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Mã mẫu bị trùng',
          path: ['items', index, 'id'],
        });
      }
      seen.add(item.id);
    });
  });
export type MarketplaceCatalog = z.infer<typeof marketplaceCatalogSchema>;

/** How a workspace came to hold an item's licence: "Đã mua" or "Miễn phí" (board 32). */
export const marketplaceLicenceSources = ['purchase', 'free'] as const;
export const marketplaceLicenceSourceSchema = z.enum(marketplaceLicenceSources);
export type MarketplaceLicenceSource = z.infer<typeof marketplaceLicenceSourceSchema>;

export const marketplaceLicenceSourceLabels: Record<MarketplaceLicenceSource, string> = {
  purchase: 'Đã mua',
  free: 'Miễn phí',
};

/**
 * The workspace's licence of an item, as board 31 shows it: "Workspace đã sở hữu · v{version}".
 * It covers every site of the workspace and is never taken back (ADR-036): a plan that ends or
 * an item that is withdrawn leaves it as it is.
 */
export const marketplaceLicenceSchema = z.object({
  source: marketplaceLicenceSourceSchema,
  /** The version new pages are made from: the one claimed or bought, then the one updated to. */
  version: templateVersionSchema,
  /** The terms agreed to when it was claimed or bought. */
  termsVersion: z.number().int().positive(),
  grantedAt: isoDateTimeSchema,
});
export type MarketplaceLicence = z.infer<typeof marketplaceLicenceSchema>;

/** A card of board 30, at the item's current version. */
export const marketplaceItemCardSchema = z.object({
  id: marketplaceItemIdSchema,
  /** The current version: the last one released. */
  version: templateVersionSchema,
  /** When the current version was released: "Mới cập nhật" sorts by it. */
  releasedOn: marketplaceReleaseDateSchema,
  name: z.string(),
  description: z.string(),
  goal: pageGoalSchema,
  industry: templateIndustrySchema,
  /** Whole đồng, VAT included; 0 is "Miễn phí". */
  price: vndAmountSchema,
  /** The current version holds the lead form: "Có form". */
  hasForm: z.boolean(),
  /** Of the current version: the thumbnail (TemplateThumb) and "N section". */
  sections: z.array(templateSectionSchema),
  /** The workspace holds its licence: the card says "Đã sở hữu" instead of the price. */
  owned: z.boolean(),
  /**
   * "Được dùng nhiều": 1 for the items most workspaces hold a licence of, items with as many
   * licences share a rank (1, 2, 2, 4). The counts themselves are not answered.
   */
  popularRank: z.number().int().positive(),
});
export type MarketplaceItemCard = z.infer<typeof marketplaceItemCardSchema>;

/**
 * Board 30: every `listed` item, in the catalog's order (at most `MAX_MARKETPLACE_ITEMS`, no
 * pagination). Search, the price filter, the industry chips and the sort run in the admin.
 */
export const marketplaceListResponseSchema = z.object({
  items: z.array(marketplaceItemCardSchema).max(MAX_MARKETPLACE_ITEMS),
  /** "Đã sở hữu · N": the workspace's licences, withdrawn items included. */
  ownedCount: z.number().int().nonnegative(),
});
export type MarketplaceListResponse = z.infer<typeof marketplaceListResponseSchema>;

/**
 * Board 31: the item at its current version with its preview, the terms, and what the viewer's
 * workspace holds. A `draft` item, and a `withdrawn` one the workspace holds no licence of, are
 * not found.
 */
export const marketplaceItemDetailSchema = marketplaceItemCardSchema.extend({
  /** The current version with sample section ids, as the registry parsed it: for the preview. */
  composition: compositionSchema,
  /** "Có gì mới ở v{version} · {releasedOn}". */
  note: z.string(),
  terms: marketplaceTermsSchema,
  /** No longer sold: only a workspace holding its licence sees it. */
  withdrawn: z.boolean(),
  /** The workspace's licence of the item; null while it holds none. */
  licence: marketplaceLicenceSchema.nullable(),
  /** The workspace's Chủ sở hữu, the only one who buys: "Đề xuất {ownerName} mua". */
  ownerName: z.string(),
});
export type MarketplaceItemDetail = z.infer<typeof marketplaceItemDetailSchema>;

/**
 * "Nhận mẫu" of a free item (board 31): the version and the terms the member saw and agreed to.
 * Either changed meanwhile: 409 `item_changed`, and the admin reads the screen again.
 */
export const claimMarketplaceItemRequestSchema = z.object({
  version: templateVersionSchema,
  termsVersion: z.number().int().positive(),
});
export type ClaimMarketplaceItemRequest = z.infer<typeof claimMarketplaceItemRequestSchema>;

/**
 * "Cập nhật" on board 32: moves the licence from `baseVersion`, the one the dialog showed the
 * notes after, to the item's current version. Another member moved it meanwhile: 409
 * `template_changed` with the licence's version.
 */
export const updateMarketplaceLicenceVersionRequestSchema = z.object({
  baseVersion: templateVersionSchema,
});
export type UpdateMarketplaceLicenceVersionRequest = z.infer<
  typeof updateMarketplaceLicenceVersionRequestSchema
>;

/** A version released after the licence's: "CÓ BẢN vM" and the notes of the update dialog. */
export const marketplaceVersionNoteEntrySchema = z.object({
  version: templateVersionSchema,
  releasedOn: marketplaceReleaseDateSchema,
  note: z.string(),
});
export type MarketplaceVersionNoteEntry = z.infer<typeof marketplaceVersionNoteEntrySchema>;

/** A row of board 32: an item the workspace holds a licence of. */
export const marketplaceOwnedItemSchema = z.object({
  itemId: marketplaceItemIdSchema,
  name: z.string(),
  /** "Payload · Đã mua" or "Payload · Miễn phí". */
  source: marketplaceLicenceSourceSchema,
  /** The licence's version: the one new pages are made from. */
  version: templateVersionSchema,
  /** The item's current version; above `version`, the row offers "Cập nhật". */
  latestVersion: templateVersionSchema,
  /** The versions after `version`, oldest first: empty when the licence is at the latest. */
  newVersions: z.array(marketplaceVersionNoteEntrySchema).max(MAX_MARKETPLACE_ITEM_VERSIONS),
  /** "NHẬN NGÀY". */
  grantedAt: isoDateTimeSchema,
  /** No longer sold: the workspace still uses and updates it. */
  withdrawn: z.boolean(),
  /** Of the licence's version: "Tạo trang" asks for a form's setup like any template. */
  hasForm: z.boolean(),
  /** Of the licence's version, for the thumbnail (TemplateThumb). */
  sections: z.array(templateSectionSchema),
  /**
   * Pages made from the item, any version, in the sites the member may open, counted as "Đã
   * dùng" on board 18: "N trang đã tạo từ mẫu này không đổi" in the update dialog.
   */
  usedCount: z.number().int().nonnegative(),
});
export type MarketplaceOwnedItem = z.infer<typeof marketplaceOwnedItemSchema>;

/**
 * Board 32: every licence of the workspace, withdrawn items included, the newest first. A
 * workspace holds at most one licence per item, so at most `MAX_MARKETPLACE_ITEMS`.
 */
export const marketplaceLicenceListResponseSchema = z.object({
  items: z.array(marketplaceOwnedItemSchema).max(MAX_MARKETPLACE_ITEMS),
});
export type MarketplaceLicenceListResponse = z.infer<typeof marketplaceLicenceListResponseSchema>;

/** `context` of 409 `item_not_free`: the item has a price, so it is bought, not claimed. */
export const marketplaceItemNotFreeProblemContextSchema = z.object({ price: vndAmountSchema });
export type MarketplaceItemNotFreeProblemContext = z.infer<
  typeof marketplaceItemNotFreeProblemContextSchema
>;

/**
 * `context` of 409 `item_changed`: what the item is now, when the version, the price or the terms
 * the member saw are no longer current.
 */
export const marketplaceItemChangedProblemContextSchema = z.object({
  version: templateVersionSchema,
  price: vndAmountSchema,
  termsVersion: z.number().int().positive(),
});
export type MarketplaceItemChangedProblemContext = z.infer<
  typeof marketplaceItemChangedProblemContextSchema
>;

/** The price filter of board 30. */
export const marketplacePriceFilters = ['all', 'free', 'paid'] as const;
export const marketplacePriceFilterSchema = z.enum(marketplacePriceFilters);
export type MarketplacePriceFilter = z.infer<typeof marketplacePriceFilterSchema>;

export const marketplacePriceFilterLabels: Record<MarketplacePriceFilter, string> = {
  all: 'Miễn phí và trả phí',
  free: 'Chỉ miễn phí',
  paid: 'Chỉ trả phí',
};

/** The sort of board 30: `releasedOn`, newest first, or `popularRank`. */
export const marketplaceSorts = ['recent', 'popular'] as const;
export const marketplaceSortSchema = z.enum(marketplaceSorts);
export type MarketplaceSort = z.infer<typeof marketplaceSortSchema>;

export const marketplaceSortLabels: Record<MarketplaceSort, string> = {
  recent: 'Mới cập nhật',
  popular: 'Được dùng nhiều',
};
