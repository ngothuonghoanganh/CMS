import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CreateNavigationRequestSchema,
  NavigationListResponseSchema,
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
        items: parsed.items,
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
      record.items = parsed.items;
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
    if (records.some((record) => containsPage(record.items, pageId))) {
      throw new ConflictException({
        code: 'PAGE_REFERENCED_BY_NAVIGATION',
        message: 'Remove this page from site navigation before deleting it',
      });
    }
  }

  async validateBeforePagePublish(
    siteId: string,
    publishingPageId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.validateSiteBeforePublish(siteId, workspaceId, publishingPageId);
  }

  async validateBeforeSitePublish(siteId: string, workspaceId: string): Promise<void> {
    await this.validateSiteBeforePublish(siteId, workspaceId, undefined, true);
  }

  private async validateSiteBeforePublish(
    siteId: string,
    workspaceId: string,
    publishingPageId?: string,
    requirePublishedHome = false,
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
    if (requirePublishedHome && !pageById.get(site.homePageId)?.publishedVersionId) {
      throw new ConflictException({
        code: 'SITE_HOMEPAGE_NOT_PUBLISHED',
        message: 'Publish the site homepage before publishing the site',
      });
    }

    const records = await this.navigationModel.find({ siteId, workspaceId }).exec();
    for (const record of records) {
      await this.validateItems(siteId, workspaceId, this.parseItems(record), pageById);
      for (const item of flattenItems(this.parseItems(record))) {
        if (item.type !== 'page' && item.type !== 'section') continue;
        if (!item.pageId) throw this.invalidTarget();
        const target = pageById.get(item.pageId);
        if (!target) continue;
        if (target._id.toString() !== publishingPageId && !target.publishedVersionId) {
          throw new ConflictException({
            code: 'NAVIGATION_PAGE_NOT_PUBLISHED',
            message: `Navigation references unpublished page ${target.name}`,
          });
        }
      }
    }
  }

  async resolveForSite(
    siteId: string,
    workspaceId: string,
    options: { published?: boolean } = {},
  ): Promise<
    { main?: ResolvedNavigationItem[]; footer?: ResolvedNavigationItem[] } | undefined
  > {
    const published = options.published ?? true;
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
        this.parseItems(record),
        site.homePageId,
        published,
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
    published = true,
  ): Promise<ResolvedNavigationItem[]> {
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
          if (!page) throw this.invalidTarget();
          const versionId = published
            ? page.publishedVersionId
            : page.currentDraftVersionId;
          if (!versionId) return null;
          const path =
            page._id.toString() === homePageId
              ? '/'
              : normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : ''));
          if (!path) throw this.invalidTarget();
          if (item.type === 'section') {
            if (!item.anchorId) throw this.invalidTarget();
            await this.assertAnchor(page, item.anchorId, versionId);
            href = `${path}#${item.anchorId}`;
          } else {
            href = path;
          }
        }
        const resolved = ResolvedNavigationItemSchema.parse({
          id: item.id,
          label: item.label,
          type: item.type,
          href,
          ...(item.openInNewTab !== undefined ? { openInNewTab: item.openInNewTab } : {}),
          ...(item.children?.length
            ? {
                children: await this.resolveItems(
                  siteId,
                  workspaceId,
                  item.children,
                  homePageId,
                  published,
                ),
              }
            : {}),
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
    if (page.anchors?.includes(anchorId)) return;
    const version = versionId
      ? await this.versionModel
          .findOne({ _id: versionId, landingPageId: page._id })
          .exec()
      : null;
    const payload = version ? PagePayloadSchema.safeParse(version.payload) : null;
    if (payload?.success && hasNodeId(payload.data.root, anchorId)) return;
    throw new ConflictException({
      code: 'NAVIGATION_ANCHOR_NOT_FOUND',
      message: `Anchor ${anchorId} was not found on page ${page.name}`,
    });
  }

  private parseItems(record: NavigationDocument): NavigationItem[] {
    const parsed = NavigationSchema.shape.items.safeParse(record.items);
    return parsed.success ? parsed.data : [];
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
    return NavigationSchema.parse({
      id: record._id.toString(),
      siteId: record.siteId,
      name: record.name,
      key: record.key,
      items: this.parseItems(record),
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
}

function flattenItems(items: NavigationItem[]): NavigationItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenItems(item.children) : []),
  ]);
}

function containsPage(items: unknown, pageId: string): boolean {
  const parsed = NavigationSchema.shape.items.safeParse(items);
  return parsed.success
    ? flattenItems(parsed.data).some(
        (item) =>
          (item.type === 'page' || item.type === 'section') && item.pageId === pageId,
      )
    : true;
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
