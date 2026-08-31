import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

import {
  CreateReusableRequestSchema,
  PaginationQuerySchema,
  ReusableComponentDocumentSchema,
  ReusableComponentSchema,
  ReusableListResponseSchema,
  ReusableUsageResponseSchema,
  DesignTokenUsageResponseSchema,
  PagePayloadSchema,
  type DesignTokenUsageResponse,
  type DesignTokenUsageReference,
  type SiteDesignSystem,
  type CreateReusableRequest,
  type PagePayload,
  type PaginationQuery,
  type ReusableComponent,
  type ReusableListResponse,
  type ReusableRuntime,
  type ReusableUsageResponse,
  type UpdateReusableRequest,
  UpdateReusableRequestSchema,
} from '@payload/contracts';

import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import {
  ReusableRecord,
  type ReusableDocument,
} from '../persistence/schemas/reusable.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';

@Injectable()
export class ReusableService {
  constructor(
    @InjectModel(ReusableRecord.name)
    private readonly reusableModel: Model<ReusableRecord>,
    @InjectModel(SiteRecord.name)
    private readonly siteModel: Model<SiteRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageDocument>,
    @InjectModel(PageVersionRecord.name)
    private readonly versionModel: Model<PageVersionRecord>,
  ) {}

  async create(workspaceId: string, siteId: string, input: CreateReusableRequest) {
    await this.requireSite(workspaceId, siteId);
    const request = CreateReusableRequestSchema.parse(input);
    const record = await this.reusableModel.create({
      _id: randomUUID(),
      workspaceId,
      siteId,
      name: request.name,
      ...(request.description ? { description: request.description } : {}),
      kind: request.kind,
      status: 'active',
      draft: request.document,
    });
    return this.toContract(record);
  }

  async list(
    workspaceId: string,
    siteId: string,
    input: PaginationQuery,
  ): Promise<ReusableListResponse> {
    await this.requireSite(workspaceId, siteId);
    const query = PaginationQuerySchema.parse(input);
    const filter = { workspaceId, siteId, status: 'active' };
    const [records, total] = await Promise.all([
      this.reusableModel
        .find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.reusableModel.countDocuments(filter).exec(),
    ]);
    return ReusableListResponseSchema.parse({
      items: records.map((record) => this.toContract(record)),
      pagination: {
        ...query,
        total,
        hasNextPage: query.offset + records.length < total,
      },
    });
  }

  async getById(workspaceId: string, siteId: string, reusableId: string) {
    const record = await this.findRecord(workspaceId, siteId, reusableId);
    return this.toContract(record);
  }

  async update(
    workspaceId: string,
    siteId: string,
    reusableId: string,
    input: UpdateReusableRequest,
  ) {
    const record = await this.findRecord(workspaceId, siteId, reusableId);
    const request = UpdateReusableRequestSchema.parse(input);
    if (request.name !== undefined) record.name = request.name;
    if (request.description !== undefined) {
      if (request.description === null) delete record.description;
      else record.description = request.description;
    }
    if (request.kind !== undefined) record.kind = request.kind;
    if (request.document !== undefined) record.draft = request.document;
    await record.save();
    return this.toContract(record);
  }

  async archive(workspaceId: string, siteId: string, reusableId: string): Promise<void> {
    const record = await this.findRecord(workspaceId, siteId, reusableId);
    // Archive removes the source from the active library without breaking
    // existing references. Public rendering can continue from the last
    // published snapshot; draft preview can continue from the saved draft.
    record.status = 'archived';
    await record.save();
  }

  async getUsage(
    workspaceId: string,
    siteId: string,
    reusableId: string,
  ): Promise<ReusableUsageResponse> {
    await this.findRecord(workspaceId, siteId, reusableId);
    const [pages, versions] = await Promise.all([
      this.pageModel.find({ workspaceId, siteId }).select({ _id: 1, name: 1 }).exec(),
      this.versionModel
        .find({ workspaceId, siteId })
        .select({ landingPageId: 1, payload: 1 })
        .exec(),
    ]);
    const counts = new Map<string, number>();
    for (const version of versions) {
      const count = countReusableInstances(
        PagePayloadSchema.parse(version.payload),
        reusableId,
      );
      if (count > 0) {
        const pageId = version.landingPageId;
        counts.set(pageId, Math.max(counts.get(pageId) ?? 0, count));
      }
    }
    const pageById = new Map(pages.map((page) => [page._id.toString(), page.name]));
    const pageItems = [...counts.entries()].flatMap(([pageId, instanceCount]) => {
      const pageName = pageById.get(pageId);
      return pageName ? [{ pageId, pageName, instanceCount }] : [];
    });
    return ReusableUsageResponseSchema.parse({
      reusableId,
      instanceCount: pageItems.reduce((total, item) => total + item.instanceCount, 0),
      pages: pageItems,
    });
  }

  /** Resolve all instances in one batch for a page render or preview. */
  async resolveForPayload(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
    published: boolean,
  ): Promise<ReusableRuntime[]> {
    const ids = [...collectReusableIds(payload)];
    if (ids.length === 0) return [];
    const records = await this.reusableModel
      .find({ workspaceId, siteId, _id: { $in: ids } })
      .exec();
    const byId = new Map(records.map((record) => [record._id.toString(), record]));
    return ids.map((id) => {
      const record = byId.get(id);
      const document = published ? record?.published : record?.draft;
      if (!record || !document) {
        throw new ConflictException({
          code: 'REUSABLE_DEPENDENCY_UNAVAILABLE',
          message: `Reusable ${id} is not available for ${published ? 'published' : 'draft'} rendering`,
          details: { reusableId: id },
        });
      }
      return { id, document: ReusableComponentDocumentSchema.parse(document) };
    });
  }

  async assertDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    payload: PagePayload,
  ): Promise<void> {
    await this.resolveForPayload(workspaceId, siteId, payload, false);
  }

  async assertDesignTokenDependenciesAvailable(
    workspaceId: string,
    siteId: string,
    designSystem: SiteDesignSystem,
    additionalValues: readonly unknown[] = [],
  ): Promise<void> {
    const knownTokenIds = new Set<string>(
      [
        ...designSystem.colors,
        ...designSystem.typography,
        ...designSystem.spacing,
        ...designSystem.radii,
        ...designSystem.shadows,
        ...designSystem.containerWidths,
      ].map((token) => token.id),
    );
    const referencedTokenIds = await this.collectSiteTokenIds(
      workspaceId,
      siteId,
      additionalValues,
    );
    const missing = [...referencedTokenIds].filter(
      (tokenId) => !knownTokenIds.has(tokenId),
    );
    if (missing.length > 0) {
      throw new ConflictException({
        code: 'DESIGN_TOKEN_DEPENDENCY_UNAVAILABLE',
        message:
          'The site cannot be published because a referenced design token is missing',
        details: { tokenIds: missing },
      });
    }
  }

  async assertDesignTokenRemovalSafe(
    workspaceId: string,
    siteId: string,
    nextDesignSystem: SiteDesignSystem,
  ): Promise<void> {
    const nextTokenIds = new Set<string>(
      [
        ...nextDesignSystem.colors,
        ...nextDesignSystem.typography,
        ...nextDesignSystem.spacing,
        ...nextDesignSystem.radii,
        ...nextDesignSystem.shadows,
        ...nextDesignSystem.containerWidths,
      ].map((token) => token.id),
    );
    const usages = await this.getAllDesignTokenUsages(workspaceId, siteId);
    const removedInUse = usages.filter(
      (usage) => usage.referenceCount > 0 && !nextTokenIds.has(usage.tokenId),
    );
    if (removedInUse.length > 0) {
      throw new ConflictException({
        code: 'DESIGN_TOKEN_IN_USE',
        message:
          'A design token cannot be deleted while it is referenced by site content',
        details: {
          tokens: removedInUse.map((usage) => ({
            tokenId: usage.tokenId,
            referenceCount: usage.referenceCount,
          })),
        },
      });
    }
  }

  async getDesignTokenUsage(
    workspaceId: string,
    siteId: string,
    tokenId: string,
  ): Promise<DesignTokenUsageResponse> {
    await this.requireSite(workspaceId, siteId);
    const usages = await this.getAllDesignTokenUsages(workspaceId, siteId);
    return (
      usages.find((usage) => usage.tokenId === tokenId) ??
      DesignTokenUsageResponseSchema.parse({
        tokenId,
        referenceCount: 0,
        references: [],
      })
    );
  }

  /** Publish source snapshots for every reusable referenced by a published page. */
  async publishReferencedForSite(workspaceId: string, siteId: string): Promise<void> {
    const pages = await this.pageModel
      .find({ workspaceId, siteId, publishedVersionId: { $exists: true, $ne: null } })
      .select({ publishedVersionId: 1 })
      .exec();
    const versionIds = pages.flatMap((page) =>
      page.publishedVersionId ? [page.publishedVersionId] : [],
    );
    if (versionIds.length === 0) return;
    const versions = await this.versionModel
      .find({ workspaceId, siteId, _id: { $in: versionIds } })
      .select({ payload: 1 })
      .exec();
    const ids = new Set<string>();
    for (const version of versions) {
      for (const id of collectReusableIds(PagePayloadSchema.parse(version.payload)))
        ids.add(id);
    }
    if (ids.size === 0) return;
    const records = await this.reusableModel
      // Archived sources remain queryable because existing published pages
      // still own a reference to their last published snapshot.
      .find({ workspaceId, siteId, _id: { $in: [...ids] } })
      .exec();
    if (records.length !== ids.size) {
      const found = new Set(records.map((record) => record._id.toString()));
      const missing = [...ids].filter((id) => !found.has(id));
      throw new ConflictException({
        code: 'REUSABLE_DEPENDENCY_UNAVAILABLE',
        message: 'Site cannot be published because a referenced reusable is unavailable',
        details: { reusableIds: missing },
      });
    }
    for (const record of records) {
      if (record.status === 'archived') {
        if (!record.published) {
          throw new ConflictException({
            code: 'REUSABLE_DEPENDENCY_UNAVAILABLE',
            message: 'An archived reusable has no published source snapshot',
            details: { reusableId: record._id.toString() },
          });
        }
        continue;
      }
      const published = ReusableComponentDocumentSchema.parse(record.draft);
      record.published = published;
    }
    await Promise.all(records.map((record) => record.save()));
  }

  private async requireSite(workspaceId: string, siteId: string): Promise<void> {
    const exists = await this.siteModel.exists({ _id: siteId, workspaceId });
    if (!exists) {
      throw new NotFoundException({
        code: 'SITE_NOT_FOUND',
        message: `Site ${siteId} was not found in workspace ${workspaceId}`,
      });
    }
  }

  private async findRecord(
    workspaceId: string,
    siteId: string,
    reusableId: string,
  ): Promise<ReusableDocument> {
    const record = await this.reusableModel
      .findOne({ _id: reusableId, workspaceId, siteId })
      .exec();
    if (!record) {
      throw new NotFoundException({
        code: 'REUSABLE_NOT_FOUND',
        message: `Reusable ${reusableId} was not found in this site`,
      });
    }
    return record;
  }

  private async collectSiteTokenIds(
    workspaceId: string,
    siteId: string,
    additionalValues: readonly unknown[] = [],
  ): Promise<Set<string>> {
    const [site, pages, reusables] = await Promise.all([
      this.siteModel
        .findOne({ _id: siteId, workspaceId })
        .select({ globalsDraft: 1, publishedGlobals: 1 })
        .lean()
        .exec(),
      this.pageModel
        .find({ workspaceId, siteId })
        .select({ currentDraftVersionId: 1, publishedVersionId: 1 })
        .lean()
        .exec(),
      this.reusableModel
        .find({ workspaceId, siteId })
        .select({ draft: 1, published: 1 })
        .lean()
        .exec(),
    ]);
    const versionIds = new Set<string>();
    pages.forEach((page) => {
      if (page.currentDraftVersionId) versionIds.add(page.currentDraftVersionId);
      if (page.publishedVersionId) versionIds.add(page.publishedVersionId);
    });
    const versions = await this.versionModel
      .find({ workspaceId, siteId, _id: { $in: [...versionIds] } })
      .select({ payload: 1 })
      .lean()
      .exec();
    const ids = new Set<string>();
    [
      site?.globalsDraft,
      site?.publishedGlobals,
      ...versions.map((version) => version.payload),
      ...reusables.flatMap((reusable) => [reusable.draft, reusable.published]),
      ...additionalValues,
    ].forEach((value) => collectTokenIds(value, ids));
    return ids;
  }

  private async getAllDesignTokenUsages(
    workspaceId: string,
    siteId: string,
  ): Promise<DesignTokenUsageResponse[]> {
    const [site, pages, versions, reusables] = await Promise.all([
      this.siteModel
        .findOne({ _id: siteId, workspaceId })
        .select({ name: 1, globalsDraft: 1, publishedGlobals: 1 })
        .lean()
        .exec(),
      this.pageModel
        .find({ workspaceId, siteId })
        .select({ _id: 1, name: 1, currentDraftVersionId: 1 })
        .lean()
        .exec(),
      this.versionModel
        .find({ workspaceId, siteId })
        .select({ _id: 1, landingPageId: 1, payload: 1 })
        .lean()
        .exec(),
      this.reusableModel
        .find({ workspaceId, siteId })
        .select({ _id: 1, name: 1, draft: 1, published: 1 })
        .lean()
        .exec(),
    ]);
    const references = new Map<string, DesignTokenUsageReference[]>();
    const add = (value: unknown, reference: Omit<DesignTokenUsageReference, 'count'>) => {
      const counts = countTokenIds(value);
      counts.forEach((count, tokenId) => {
        const existing = references.get(tokenId) ?? [];
        existing.push({ ...reference, count });
        references.set(tokenId, existing);
      });
    };

    const pageById = new Map(pages.map((page) => [page._id.toString(), page]));
    const versionsByPage = new Map<string, typeof versions>();
    for (const version of versions) {
      const existing = versionsByPage.get(version.landingPageId) ?? [];
      existing.push(version);
      versionsByPage.set(version.landingPageId, existing);
    }
    for (const [pageId, pageVersions] of versionsByPage) {
      const page = pageById.get(pageId);
      if (!page) continue;
      // A page can have many historical versions; usage is reported from the
      // current draft and does not multiply references by version history.
      const current =
        pageVersions.find(
          (version) => version._id.toString() === page.currentDraftVersionId,
        ) ?? pageVersions[0];
      if (current) {
        add(current.payload, {
          kind: 'page',
          id: pageId,
          name: page.name,
        });
      }
    }
    if (site) {
      add(site.globalsDraft, {
        kind: 'global',
        id: siteId,
        name: `${site.name} globals`,
      });
      add(site.publishedGlobals, {
        kind: 'global',
        id: siteId,
        name: `${site.name} globals`,
      });
    }
    for (const reusable of reusables) {
      const draftCounts = countTokenIds(reusable.draft);
      const publishedCounts = countTokenIds(reusable.published);
      const merged = new Map(draftCounts);
      publishedCounts.forEach((count, tokenId) => {
        merged.set(tokenId, Math.max(merged.get(tokenId) ?? 0, count));
      });
      merged.forEach((count, tokenId) => {
        const existing = references.get(tokenId) ?? [];
        existing.push({
          kind: 'reusable',
          id: reusable._id.toString(),
          name: reusable.name,
          count,
        });
        references.set(tokenId, existing);
      });
    }
    return [...references.entries()].map(([tokenId, tokenReferences]) =>
      DesignTokenUsageResponseSchema.parse({
        tokenId,
        referenceCount: tokenReferences.reduce(
          (total, reference) => total + reference.count,
          0,
        ),
        references: tokenReferences,
      }),
    );
  }

  private toContract(record: ReusableDocument): ReusableComponent {
    return ReusableComponentSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      name: record.name,
      ...(record.description ? { description: record.description } : {}),
      kind: record.kind,
      status: record.status,
      draft: record.draft,
      ...(record.published ? { published: record.published } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}

function collectTokenIds(value: unknown, target: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTokenIds(entry, target));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (record.kind === 'token' && typeof record.tokenId === 'string') {
    target.add(record.tokenId);
  }
  Object.values(record).forEach((entry) => collectTokenIds(entry, target));
}

function countTokenIds(value: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    if (record.kind === 'token' && typeof record.tokenId === 'string') {
      counts.set(record.tokenId, (counts.get(record.tokenId) ?? 0) + 1);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return counts;
}

function collectReusableIds(payload: PagePayload): Set<string> {
  const ids = new Set<string>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as {
      type?: unknown;
      props?: { reusableId?: unknown };
      children?: unknown;
    };
    if (
      candidate.type === 'reusable-instance' &&
      typeof candidate.props?.reusableId === 'string'
    ) {
      ids.add(candidate.props.reusableId);
    }
    if (Array.isArray(candidate.children)) candidate.children.forEach(visit);
  };
  visit(payload.root);
  return ids;
}

function countReusableInstances(payload: unknown, reusableId: string): number {
  let count = 0;
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as {
      type?: unknown;
      props?: { reusableId?: unknown };
      children?: unknown;
    };
    if (
      candidate.type === 'reusable-instance' &&
      candidate.props?.reusableId === reusableId
    )
      count += 1;
    if (Array.isArray(candidate.children)) candidate.children.forEach(visit);
  };
  if (payload && typeof payload === 'object' && 'root' in payload) {
    visit((payload as { root: unknown }).root);
  }
  return count;
}
