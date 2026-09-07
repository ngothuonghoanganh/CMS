import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CreateNavigationRequestSchema,
  NavigationItemsSchema,
  NavigationListResponseSchema,
  NavigationSchema,
  NavigationViewPropsSchema,
  navigationActionHref,
  validateNavigationItems,
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
import {
  LayoutExtensionRecord,
  LayoutExtensionVersionRecord,
} from '../persistence/schemas/layout-extension.schema';
import {
  TemplateRecord,
  TemplateVersionRecord,
} from '../persistence/schemas/template.schema';
import { ReusableRecord } from '../persistence/schemas/reusable.schema';

/**
 * Navigation is pure menu data. There is no draft/published lifecycle, no
 * layout and no renderer here; `resolveForSite` only turns internal targets
 * into resolved hrefs for the data-bound `navigation-view` component.
 */
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
    @InjectModel(LayoutExtensionRecord.name)
    private readonly layoutModel: Model<LayoutExtensionRecord>,
    @InjectModel(LayoutExtensionVersionRecord.name)
    private readonly layoutVersionModel: Model<LayoutExtensionVersionRecord>,
    @InjectModel(TemplateRecord.name)
    private readonly templateModel: Model<TemplateRecord>,
    @InjectModel(TemplateVersionRecord.name)
    private readonly templateVersionModel: Model<TemplateVersionRecord>,
    @InjectModel(ReusableRecord.name)
    private readonly reusableModel: Model<ReusableRecord>,
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

  /** Canonical workspace-owned navigation read. */
  async listWorkspace(workspaceId: string): Promise<NavigationListResponse> {
    const records = await this.navigationModel
      .find({ workspaceId, ownershipScope: 'workspace' })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return NavigationListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
    });
  }

  async getWorkspace(workspaceId: string, navigationId: string): Promise<Navigation> {
    const record = await this.navigationModel
      .findOne({ _id: navigationId, workspaceId, ownershipScope: 'workspace' })
      .exec();
    if (!record) throw this.notFound(navigationId);
    return this.toContract(record);
  }

  async createWorkspace(
    workspaceId: string,
    input: CreateNavigationRequest,
  ): Promise<Navigation> {
    const parsed = CreateNavigationRequestSchema.parse(input);
    await this.validateItems(undefined, workspaceId, parsed.items);
    try {
      const record = await this.navigationModel.create({
        _id: randomUUID(),
        workspaceId,
        ownershipScope: 'workspace',
        name: parsed.name,
        key: parsed.key,
        items: parsed.items,
      });
      return this.toContract(record);
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.duplicateKey();
      throw error;
    }
  }

  async updateWorkspace(
    workspaceId: string,
    navigationId: string,
    input: UpdateNavigationRequest,
  ): Promise<Navigation> {
    const parsed = UpdateNavigationRequestSchema.parse(input);
    const record = await this.navigationModel
      .findOne({ _id: navigationId, workspaceId, ownershipScope: 'workspace' })
      .exec();
    if (!record) throw this.notFound(navigationId);
    if (parsed.name !== undefined) record.name = parsed.name;
    if (parsed.items !== undefined) {
      await this.validateItems(undefined, workspaceId, parsed.items);
      record.items = parsed.items;
    }
    await record.save();
    return this.toContract(record);
  }

  async removeWorkspace(workspaceId: string, navigationId: string): Promise<void> {
    const result = await this.navigationModel
      .deleteOne({ _id: navigationId, workspaceId, ownershipScope: 'workspace' })
      .exec();
    if (!result.deletedCount) throw this.notFound(navigationId);
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
        ownershipScope: 'site',
        name: parsed.name,
        key: parsed.key,
        items: parsed.items,
      });
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

  /**
   * Validate Builder-owned navigation in any persisted document. Inline menus
   * deliberately use the same target and size rules as legacy Navigation
   * resources, while the optional site scope keeps workspace-owned layouts and
   * templates portable across sites.
   */
  async validateInlineNavigationDocument(
    document: unknown,
    workspaceId: string,
    siteId?: string,
  ): Promise<void> {
    const pending: unknown[] = [document];
    while (pending.length > 0) {
      const current = pending.pop();
      if (Array.isArray(current)) {
        pending.push(...current);
        continue;
      }
      if (!current || typeof current !== 'object') continue;
      const record = current as Record<string, unknown>;
      if (record.type === 'navigation-view') {
        const props = NavigationViewPropsSchema.safeParse(record.props);
        if (!props.success) {
          throw new ConflictException({
            code: 'INVALID_INLINE_NAVIGATION',
            message: 'The inline navigation component is invalid',
            details: { issues: props.error.issues },
          });
        }
        if (props.data.items) {
          await this.validateItems(siteId, workspaceId, props.data.items);
        }
      }
      pending.push(...Object.values(record));
    }
  }

  async assertPageCanBeDeleted(
    siteId: string,
    pageId: string,
    workspaceId: string,
  ): Promise<void> {
    const records = await this.navigationModel.find({ siteId, workspaceId }).exec();
    const usages: NavigationUsage[] = records.flatMap((record) =>
      collectLegacyNavigationUsages(record, pageId),
    );
    if (usages.length > 0) {
      throw new ConflictException({
        code: 'PAGE_REFERENCED_BY_NAVIGATION',
        message: 'Remove this page from site navigation before deleting it',
        details: { usages },
      });
    }
    usages.push(...(await this.findInlineNavigationUsages(siteId, pageId, workspaceId)));
    if (usages.length > 0) {
      throw new ConflictException({
        code: 'PAGE_REFERENCED_BY_NAVIGATION',
        message: 'Remove this page from site navigation before deleting it',
        details: { usages },
      });
    }
  }

  private async findInlineNavigationUsages(
    siteId: string,
    pageId: string,
    workspaceId: string,
  ): Promise<NavigationUsage[]> {
    const usages: NavigationUsage[] = [];
    const add = (
      document: unknown,
      resourceType: NavigationUsage['resourceType'],
      resourceId: string,
      resourceName: string,
      state: NavigationUsage['state'],
    ) => {
      usages.push(
        ...collectInlineNavigationUsages(document, pageId).map((usage) => ({
          ...usage,
          resourceType,
          resourceId,
          resourceName,
          state,
        })),
      );
    };

    const pages = await this.pageModel
      .find({ workspaceId, siteId })
      .select({ _id: 1, name: 1, currentDraftVersionId: 1, publishedVersionId: 1 })
      .exec();
    const pageVersionIds = [
      ...new Set(
        pages.flatMap((page) =>
          [page.currentDraftVersionId, page.publishedVersionId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const pageVersions = pageVersionIds.length
      ? await this.versionModel
          .find({ workspaceId, siteId, _id: { $in: pageVersionIds } })
          .select({ _id: 1, landingPageId: 1, payload: 1 })
          .exec()
      : [];
    const pageById = new Map(pages.map((page) => [page._id.toString(), page]));
    for (const version of pageVersions) {
      const page = pageById.get(version.landingPageId);
      if (!page) continue;
      const state =
        version._id.toString() === page.publishedVersionId ? 'published' : 'current';
      add(version.payload, 'page', version.landingPageId, page.name, state);
    }

    const layoutResources = await this.layoutModel
      .find({ workspaceId, $or: [{ siteId }, { siteId: { $exists: false } }] })
      .select({ _id: 1, name: 1, draftVersionId: 1, publishedVersionId: 1 })
      .exec();
    const layoutVersionIds = [
      ...new Set(
        layoutResources.flatMap((resource) =>
          [resource.draftVersionId, resource.publishedVersionId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    if (layoutVersionIds.length) {
      const versions = await this.layoutVersionModel
        .find({ workspaceId, _id: { $in: layoutVersionIds } })
        .select({ _id: 1, resourceId: 1, document: 1 })
        .exec();
      const resourcesById = new Map(
        layoutResources.map((resource) => [resource._id.toString(), resource]),
      );
      for (const version of versions) {
        const resource = resourcesById.get(version.resourceId);
        if (!resource) continue;
        const state =
          version._id.toString() === resource.publishedVersionId
            ? 'published'
            : 'current';
        add(version.document, 'layout', version.resourceId, resource.name, state);
      }
    }

    const templates = await this.templateModel
      .find({ workspaceId })
      .select({ _id: 1, name: 1, latestVersionId: 1, publishedVersionId: 1 })
      .exec();
    const templateVersionIds = [
      ...new Set(
        templates.flatMap((template) =>
          [template.latestVersionId, template.publishedVersionId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    if (templateVersionIds.length) {
      const versions = await this.templateVersionModel
        .find({ workspaceId, _id: { $in: templateVersionIds } })
        .select({ _id: 1, templateId: 1, payload: 1 })
        .exec();
      const templatesById = new Map(
        templates.map((template) => [template._id.toString(), template]),
      );
      for (const version of versions) {
        const template = templatesById.get(version.templateId);
        if (!template) continue;
        const state =
          version._id.toString() === template.publishedVersionId
            ? 'published'
            : 'current';
        add(version.payload, 'template', version.templateId, template.name, state);
      }
    }

    const reusables = await this.reusableModel
      .find({ workspaceId, siteId })
      .select({ _id: 1, name: 1, draft: 1, published: 1 })
      .exec();
    for (const reusable of reusables) {
      add(reusable.draft, 'reusable', reusable._id.toString(), reusable.name, 'current');
      if (reusable.published) {
        add(
          reusable.published,
          'reusable',
          reusable._id.toString(),
          reusable.name,
          'published',
        );
      }
    }
    return usages;
  }

  /**
   * Resolve menu items to hrefs. `mode` only selects which page version each
   * target resolves against (published for live, draft for preview); the menu
   * data itself has no publishing lifecycle.
   */
  async resolveForSite(
    siteId: string,
    workspaceId: string,
    options: { mode?: 'draft' | 'published' } = {},
  ): Promise<
    { main?: ResolvedNavigationItem[]; footer?: ResolvedNavigationItem[] } | undefined
  > {
    const mode = options.mode ?? 'published';
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
        this.readItems(record),
        site.homePageId,
        mode,
      );
      if (record.key === 'main' && !result.main) result.main = items;
      if (record.key === 'footer' && !result.footer) result.footer = items;
    }
    return result;
  }

  /** Resolve page identities used by Builder-owned inline navigation items. */
  async resolvePagePaths(
    siteId: string,
    workspaceId: string,
    pageIds: readonly string[],
    homePageId: string | undefined,
    mode: 'draft' | 'published' = 'published',
  ): Promise<Record<string, string>> {
    if (pageIds.length === 0) return {};
    const pages = await this.pageModel
      .find({ _id: { $in: [...new Set(pageIds)] }, siteId, workspaceId })
      .exec();
    const result: Record<string, string> = {};
    for (const page of pages) {
      if (page.kind === 'dynamic' || page.status === 'archived') continue;
      const versionId =
        mode === 'published'
          ? page.publishedVersionId
          : (page.currentDraftVersionId ?? page.publishedVersionId);
      if (!versionId) continue;
      const id = page._id.toString();
      const path =
        id === homePageId
          ? '/'
          : normalizePagePath(page.path ?? (page.slug ? `/${page.slug}` : ''));
      if (path) result[id] = path;
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
          href = navigationActionHref(item.action.type, item.action.value);
        } else {
          if (!item.pageId) throw this.invalidTarget();
          const page = await this.pageModel
            .findOne({ _id: item.pageId, siteId, workspaceId })
            .exec();
          if (!page || page.kind === 'dynamic' || page.status === 'archived') {
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
        return ResolvedNavigationItemSchema.parse({
          id: item.id,
          label: item.label,
          type: item.type,
          href,
          ...(item.openInNewTab !== undefined ? { openInNewTab: item.openInNewTab } : {}),
          ...(children?.length ? { children } : {}),
        });
      }),
    );
    return resolvedItems.filter((item): item is ResolvedNavigationItem => item !== null);
  }

  private async validateItems(
    siteId: string | undefined,
    workspaceId: string,
    items: NavigationItem[],
  ): Promise<void> {
    const limits = validateNavigationItems(items);
    if (!limits.valid) {
      throw new ConflictException({
        code:
          limits.reason === 'node-limit'
            ? 'NAVIGATION_NODE_LIMIT_EXCEEDED'
            : 'NAVIGATION_PAYLOAD_TOO_LARGE',
        message: 'Navigation data exceeds the supported size limit',
      });
    }
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
      const page = await this.pageModel
        .findOne({
          _id: item.pageId,
          workspaceId,
          ...(siteId ? { siteId } : {}),
          status: { $ne: 'archived' },
        })
        .exec();
      if (!page) throw this.invalidTarget();
      if (page.kind === 'dynamic') throw this.invalidTarget();
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

  private readItems(record: NavigationDocument): NavigationItem[] {
    const parsed = NavigationItemsSchema.safeParse(record.items ?? []);
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
    return NavigationSchema.parse({
      id: record._id.toString(),
      ...(isEntityId(record.workspaceId) ? { workspaceId: record.workspaceId } : {}),
      ...(record.siteId ? { siteId: record.siteId } : {}),
      name: record.name,
      key: record.key,
      items: this.readItems(record),
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

  private duplicateKey(): ConflictException {
    return new ConflictException({
      code: 'DUPLICATE_NAVIGATION_KEY',
      message: 'A navigation with this key already exists in the workspace',
    });
  }
}

type NavigationUsage = {
  resourceType: 'navigation' | 'page' | 'layout' | 'template' | 'reusable';
  resourceId: string;
  resourceName: string;
  state: 'current' | 'published';
  itemId: string;
  label: string;
  navigationKey?: string;
};

/** Collect page references without recursively walking an untrusted tree. */
export function collectNavigationPageIds(value: unknown): string[] {
  const ids = new Set<string>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    if (
      (record.type === 'page' || record.type === 'section') &&
      typeof record.pageId === 'string'
    ) {
      ids.add(record.pageId);
    }
    pending.push(...Object.values(record));
  }
  return [...ids];
}

function collectLegacyNavigationUsages(
  record: NavigationDocument,
  pageId: string,
): NavigationUsage[] {
  const parsed = NavigationItemsSchema.safeParse(record.items ?? []);
  if (!parsed.success) return [];
  return flattenItems(parsed.data)
    .filter(
      (item) =>
        (item.type === 'page' || item.type === 'section') && item.pageId === pageId,
    )
    .map((item) => ({
      resourceType: 'navigation' as const,
      resourceId: record._id.toString(),
      resourceName: record.name,
      state: 'current' as const,
      itemId: item.id,
      label: item.label,
      navigationKey: record.key,
    }));
}

function collectInlineNavigationUsages(
  document: unknown,
  pageId: string,
): Array<Pick<NavigationUsage, 'itemId' | 'label'>> {
  const result: Array<Pick<NavigationUsage, 'itemId' | 'label'>> = [];
  const pending: unknown[] = [document];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    if (record.type === 'navigation-view') {
      const props = NavigationViewPropsSchema.safeParse(record.props);
      if (props.success && props.data.items) {
        for (const item of flattenItems(props.data.items)) {
          if (
            (item.type === 'page' || item.type === 'section') &&
            item.pageId === pageId
          ) {
            result.push({ itemId: item.id, label: item.label });
          }
        }
      }
    }
    pending.push(...Object.values(record));
  }
  return result;
}

function isEntityId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/.test(
      value,
    )
  );
}

function flattenItems(items: NavigationItem[]): NavigationItem[] {
  const result: NavigationItem[] = [];
  const pending = [...items].reverse();
  while (pending.length) {
    const item = pending.pop();
    if (!item) continue;
    result.push(item);
    if (item.children?.length) pending.push(...[...item.children].reverse());
  }
  return result;
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
