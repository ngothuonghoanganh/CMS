import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CreateNavigationRequestSchema,
  NavigationListResponseSchema,
  NavigationItemsSchema,
  NavigationPublishWarningSchema,
  NavigationSchema,
  type NavigationActionType,
  PagePayloadSchema,
  ResolvedNavigationItemSchema,
  UpdateNavigationRequestSchema,
  normalizePagePath,
  type CreateNavigationRequest,
  type Navigation,
  type NavigationItem,
  type NavigationListResponse,
  type NavigationPublishWarning,
  type ResolvedNavigationItem,
  type UpdateNavigationRequest,
} from '@payload/contracts';
import { randomUUID } from 'node:crypto';

import { PageRecord } from '../persistence/schemas/page.schema';
import {
  NavigationRecord,
  type NavigationDocument,
} from '../persistence/schemas/navigation.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { SiteRecord, type SiteDocument } from '../persistence/schemas/site.schema';

@Injectable()
export class NavigationService {
  constructor(
    @InjectModel(NavigationRecord.name)
    private readonly navigationModel: Model<NavigationRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
  ) {}

  async list(siteId: string, workspaceId: string): Promise<NavigationListResponse> {
    await this.requireSite(siteId, workspaceId);
    const records = await this.navigationModel
      .find({ siteId, workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return NavigationListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async get(
    siteId: string,
    navigationId: string,
    workspaceId: string,
  ): Promise<Navigation> {
    const record = await this.navigationModel
      .findOne({ _id: navigationId, siteId, workspaceId })
      .exec();
    if (!record) throw this.notFound(navigationId);
    return this.toContract(record);
  }

  async create(
    siteId: string,
    input: CreateNavigationRequest,
    workspaceId: string,
  ): Promise<Navigation> {
    await this.requireSite(siteId, workspaceId);
    const parsed = CreateNavigationRequestSchema.parse(input);
    await this.validateItems(siteId, workspaceId, parsed.items);
    try {
      const record = await this.navigationModel.create({
        _id: randomUUID(),
        workspaceId,
        siteId,
        name: parsed.name,
        key: parsed.key,
        draftItems: parsed.items,
      });
      if (parsed.key === 'main' || parsed.key === 'footer') {
        await this.siteModel
          .updateOne(
            { _id: siteId, workspaceId },
            {
              $set:
                parsed.key === 'main'
                  ? { primaryNavigationId: record._id.toString() }
                  : { footerNavigationId: record._id.toString() },
            },
          )
          .exec();
      }
      return this.toContract(record);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({
          code: 'DUPLICATE_NAVIGATION_KEY',
          message: 'A navigation with this key already exists in the site',
        });
      }
      throw error;
    }
  }

  async update(
    siteId: string,
    navigationId: string,
    input: UpdateNavigationRequest,
    workspaceId: string,
  ): Promise<Navigation> {
    const parsed = UpdateNavigationRequestSchema.parse(input);
    const record = await this.navigationModel
      .findOne({ _id: navigationId, siteId, workspaceId })
      .exec();
    if (!record) throw this.notFound(navigationId);
    if (parsed.name !== undefined) record.name = parsed.name;
    if (parsed.items !== undefined) {
      await this.validateItems(siteId, workspaceId, parsed.items);
      record.draftItems = parsed.items;
    }
    await record.save();
    return this.toContract(record);
  }

  async remove(siteId: string, navigationId: string, workspaceId: string): Promise<void> {
    const result = await this.navigationModel
      .deleteOne({ _id: navigationId, siteId, workspaceId })
      .exec();
    if (!result.deletedCount) throw this.notFound(navigationId);
  }

  async assertPageCanBeDeleted(
    siteId: string,
    pageId: string,
    workspaceId: string,
  ): Promise<void> {
    const records = await this.navigationModel.find({ siteId, workspaceId }).exec();
    if (records.some((record) => containsPage(record, pageId))) {
      throw new ConflictException({
        code: 'PAGE_REFERENCED_BY_NAVIGATION',
        message: 'Remove this page from site navigation before deleting it',
      });
    }
  }

  async validateBeforeSitePublish(siteId: string, workspaceId: string): Promise<void> {
    await this.validateSiteBeforePublish(siteId, workspaceId);
  }

  /**
   * Promote the editable navigation structures with the other site-level
   * resources. Page publication is deliberately not part of this operation:
   * a published structure may reference pages that are currently unavailable.
   */
  async publishForSite(
    siteId: string,
    workspaceId: string,
  ): Promise<{ warnings: NavigationPublishWarning[] }> {
    await this.validateBeforeSitePublish(siteId, workspaceId);
    const pages = await this.pageModel.find({ siteId, workspaceId }).exec();
    const pageById = new Map(pages.map((page) => [page._id.toString(), page]));
    const records = await this.navigationModel.find({ siteId, workspaceId }).exec();
    const warnings: NavigationPublishWarning[] = [];
    const publishedAt = new Date();
    for (const record of records) {
      const draftItems = this.readItems(record, 'draft');
      warnings.push(
        ...draftTargetWarnings(record._id.toString(), record.key, draftItems, pageById),
      );
      record.publishedItems = draftItems;
      record.publishedAt = publishedAt;
      await record.save();
    }
    return { warnings };
  }

  private async validateSiteBeforePublish(
    siteId: string,
    workspaceId: string,
  ): Promise<void> {
    const site = await this.requireSite(siteId, workspaceId);
    const pages = await this.pageModel.find({ siteId, workspaceId }).exec();
    const pageById = new Map(pages.map((page) => [page._id.toString(), page]));
    const paths = new Set<string>();
    for (const page of pages) {
      const path = normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : '/'));
      if (!path || paths.has(path)) {
        throw new ConflictException({
          code: 'DUPLICATE_PAGE_PATH',
          message: 'The site contains duplicate or invalid page paths',
        });
      }
      paths.add(path);
    }
    if (!site.homePageId || !pageById.has(site.homePageId)) {
      throw new ConflictException({
        code: 'SITE_HOMEPAGE_REQUIRED',
        message: 'The site must have a homepage before it can be published',
      });
    }
    if (!pageById.get(site.homePageId)?.publishedVersionId) {
      throw new ConflictException({
        code: 'SITE_HOMEPAGE_NOT_PUBLISHED',
        message: 'Publish the site homepage before publishing the site',
      });
    }

    const records = await this.navigationModel.find({ siteId, workspaceId }).exec();
    for (const record of records) {
      await this.validateItems(
        siteId,
        workspaceId,
        this.readItems(record, 'draft'),
        pageById,
      );
    }
  }

  async resolveForSite(
    siteId: string,
    workspaceId: string,
    options: { mode?: 'draft' | 'published'; published?: boolean } = {},
  ): Promise<
    { main?: ResolvedNavigationItem[]; footer?: ResolvedNavigationItem[] } | undefined
  > {
    const mode = options.mode ?? (options.published === false ? 'draft' : 'published');
    const site = await this.requireSite(siteId, workspaceId);
    const records = await this.navigationModel
      .find({ siteId, workspaceId, key: { $in: ['main', 'footer'] } })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    if (!records.length) return undefined;
    const result: { main?: ResolvedNavigationItem[]; footer?: ResolvedNavigationItem[] } =
      {};
    for (const record of records) {
      const items = await this.resolveItems(
        siteId,
        workspaceId,
        this.readItems(record, mode),
        site.homePageId,
        mode,
      );
      if (record.key === 'main' && !result.main) result.main = items;
      if (record.key === 'footer' && !result.footer) result.footer = items;
    }
    return result;
  }

  private async resolveItems(
    siteId: string,
    workspaceId: string,
    items: NavigationItem[],
    homePageId?: string,
    mode: 'draft' | 'published' = 'published',
  ): Promise<ResolvedNavigationItem[]> {
    const strict = mode === 'draft';
    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        let href: string;
        if (item.type === 'external') {
          if (!item.externalUrl) throw this.invalidTarget();
          href = item.externalUrl;
        } else if (item.type === 'action') {
          if (!item.action) throw this.invalidTarget();
          href = actionHref(item.action.type, item.action.value);
        } else {
          if (!item.pageId) throw this.invalidTarget();
          const page = await this.pageModel
            .findOne({ _id: item.pageId, siteId, workspaceId })
            .exec();
          if (!page) {
            if (!strict) return null;
            throw this.invalidTarget();
          }
          const versionId =
            mode === 'published'
              ? page.publishedVersionId
              : (page.currentDraftVersionId ?? page.publishedVersionId);
          if (!versionId) return null;
          const path =
            page._id.toString() === homePageId
              ? '/'
              : normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : ''));
          if (!path) throw this.invalidTarget();
          if (item.type === 'section') {
            if (!item.anchorId) throw this.invalidTarget();
            try {
              await this.assertAnchor(page, item.anchorId, versionId);
            } catch (error) {
              if (!strict && isNavigationError(error, 'NAVIGATION_ANCHOR_NOT_FOUND')) {
                return null;
              }
              throw error;
            }
            href = `${path}#${item.anchorId}`;
          } else {
            href = path;
          }
        }
        const children = item.children?.length
          ? await this.resolveItems(siteId, workspaceId, item.children, homePageId, mode)
          : undefined;
        const resolved = ResolvedNavigationItemSchema.parse({
          id: item.id,
          label: item.label,
          type: item.type,
          href,
          ...(item.openInNewTab !== undefined ? { openInNewTab: item.openInNewTab } : {}),
          ...(children?.length ? { children } : {}),
        });
        return resolved;
      }),
    );
    return resolvedItems.filter((item): item is ResolvedNavigationItem => item !== null);
  }

  private async validateItems(
    siteId: string,
    workspaceId: string,
    items: NavigationItem[],
    pageById?: Map<string, PageRecord>,
  ): Promise<void> {
    const ids = new Set<string>();
    for (const item of flattenItems(items)) {
      if (ids.has(item.id)) {
        throw new ConflictException({
          code: 'DUPLICATE_NAVIGATION_ITEM',
          message: `Navigation item ${item.id} is duplicated`,
        });
      }
      ids.add(item.id);
      if (item.type !== 'page' && item.type !== 'section') continue;
      if (!item.pageId) throw this.invalidTarget();
      const page =
        pageById?.get(item.pageId) ??
        (await this.pageModel.findOne({ _id: item.pageId, siteId, workspaceId }).exec());
      if (!page) throw this.invalidTarget();
      if (item.type === 'section') {
        if (!item.anchorId) throw this.invalidTarget();
        await this.assertAnchor(page, item.anchorId);
      }
    }
  }

  private async assertAnchor(
    page: PageRecord,
    anchorId: string,
    versionId = page.currentDraftVersionId ?? page.publishedVersionId,
  ): Promise<void> {
    // `page.anchors` is draft metadata. It is safe as a shortcut only while
    // validating the draft version; public resolution must inspect the
    // published payload so a removed draft anchor cannot create a broken link.
    if (versionId === page.currentDraftVersionId && page.anchors?.includes(anchorId)) {
      return;
    }
    const version = versionId
      ? await this.versionModel
          .findOne({ _id: versionId, landingPageId: page._id })
          .exec()
      : null;
    const payload = version ? PagePayloadSchema.safeParse(version.payload) : null;
    if (payload?.success && hasNodeId(payload.data.root, anchorId)) return;
    if (!versionId && page.anchors?.includes(anchorId)) return;
    throw new ConflictException({
      code: 'NAVIGATION_ANCHOR_NOT_FOUND',
      message: `Anchor ${anchorId} was not found on page ${page.name}`,
    });
  }

  private readItems(
    record: NavigationDocument,
    mode: 'draft' | 'published',
  ): NavigationItem[] {
    const value =
      mode === 'draft'
        ? (record.draftItems ?? record.items ?? [])
        : (record.publishedItems ??
          (record.draftItems === undefined ? record.items : undefined) ??
          []);
    const parsed = NavigationItemsSchema.safeParse(value);
    if (!parsed.success) throw this.invalidStructure();
    return parsed.data;
  }

  private async requireSite(siteId: string, workspaceId: string): Promise<SiteDocument> {
    const site = await this.siteModel.findOne({ _id: siteId, workspaceId }).exec();
    if (!site) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: 'Site was not found',
      });
    }
    return site;
  }

  private toContract(record: NavigationDocument): Navigation {
    const draftItems = this.readItems(record, 'draft');
    const hasPublishedStructure =
      record.publishedItems !== undefined ||
      (record.draftItems === undefined && record.items !== undefined);
    const publishedItems = this.readItems(record, 'published');
    return NavigationSchema.parse({
      id: record._id.toString(),
      siteId: record.siteId,
      name: record.name,
      key: record.key,
      items: draftItems,
      draftItems,
      ...(hasPublishedStructure ? { publishedItems } : {}),
      ...(record.publishedAt ? { publishedAt: record.publishedAt.toISOString() } : {}),
      hasUnpublishedChanges:
        !hasPublishedStructure ||
        JSON.stringify(draftItems) !== JSON.stringify(publishedItems),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'NAVIGATION_NOT_FOUND',
      message: `Navigation ${id} was not found in the site`,
    });
  }

  private invalidTarget(): ConflictException {
    return new ConflictException({
      code: 'INVALID_NAVIGATION_TARGET',
      message: 'Navigation contains an invalid internal target',
    });
  }

  private invalidStructure(): ConflictException {
    return new ConflictException({
      code: 'INVALID_NAVIGATION_STRUCTURE',
      message: 'Navigation contains invalid persisted items',
    });
  }
}

function flattenItems(items: NavigationItem[]): NavigationItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenItems(item.children) : []),
  ]);
}

function containsPage(record: NavigationDocument, pageId: string): boolean {
  for (const items of [record.draftItems, record.publishedItems, record.items]) {
    if (items === undefined) continue;
    const parsed = NavigationItemsSchema.safeParse(items);
    if (!parsed.success) return true;
    if (
      flattenItems(parsed.data).some(
        (item) =>
          (item.type === 'page' || item.type === 'section') && item.pageId === pageId,
      )
    ) {
      return true;
    }
  }
  return false;
}

function draftTargetWarnings(
  navigationId: string,
  navigationKey: string,
  items: NavigationItem[],
  pageById: Map<string, PageRecord>,
): NavigationPublishWarning[] {
  return flattenItems(items).flatMap((item) => {
    if (item.type !== 'page' && item.type !== 'section') return [];
    if (!item.pageId) return [];
    const page = pageById.get(item.pageId);
    if (!page || page.publishedVersionId) return [];
    return [
      NavigationPublishWarningSchema.parse({
        code: 'NAVIGATION_TARGET_DRAFT',
        navigationId,
        navigationKey,
        itemId: item.id,
        label: item.label,
        pageId: item.pageId,
        pageName: page.name,
      }),
    ];
  });
}

function isNavigationError(error: unknown, code: string): boolean {
  if (!(error instanceof ConflictException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === code
  );
}

function hasNodeId(node: { id: string; children: unknown[] }, target: string): boolean {
  if (node.id === target) return true;
  return node.children.some((child) => {
    if (
      !child ||
      typeof child !== 'object' ||
      !('id' in child) ||
      !('children' in child)
    ) {
      return false;
    }
    return hasNodeId(child as { id: string; children: unknown[] }, target);
  });
}

function actionHref(type: NavigationActionType, value: string): string {
  if (type === 'phone') return `tel:${value}`;
  if (type === 'email') return value.startsWith('mailto:') ? value : `mailto:${value}`;
  return value;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
