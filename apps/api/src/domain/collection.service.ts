import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  CollectionDefinitionSchema,
  CollectionEntryListQuerySchema,
  CollectionEntryListResponseSchema,
  CollectionEntryResponseSchema,
  CollectionQueryRequestSchema,
  CollectionQueryResponseSchema,
  CreateCollectionEntryRequestSchema,
  CreateCollectionRequestSchema,
  DataSourceDescriptorSchema,
  PageCompositionSchema,
  PageQuerySchema,
  ResolvedDataContextSchema,
  ResolvedDataRecordSchema,
  UpdateCollectionEntryRequestSchema,
  UpdateCollectionRequestSchema,
  type Collection,
  type CollectionDefinition,
  type CollectionEntryListQuery,
  type CollectionEntryListResponse,
  type CollectionEntryResponse,
  type CollectionQueryRequest,
  type CollectionQueryResponse,
  type CreateCollectionEntryRequest,
  type CreateCollectionRequest,
  type PageComposition,
  type ResolvedDataContext,
  type ResolvedDataRecord,
  type UpdateCollectionEntryRequest,
  type UpdateCollectionRequest,
} from '@payload/contracts';

import {
  CollectionEntryRecord,
  CollectionEntryVersionRecord,
  CollectionRecord,
  type CollectionDocument,
  type CollectionEntryDocument,
  type CollectionEntryVersionDocument,
} from '../persistence/schemas/collection.schema';
import { AssetRecord } from '../persistence/schemas/asset.schema';
import { PageRecord, type PageDocument } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';

const safeDataPath = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;
const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CollectionService {
  constructor(
    @InjectModel(CollectionRecord.name)
    private readonly collectionModel: Model<CollectionRecord>,
    @InjectModel(CollectionEntryRecord.name)
    private readonly entryModel: Model<CollectionEntryRecord>,
    @InjectModel(CollectionEntryVersionRecord.name)
    private readonly entryVersionModel: Model<CollectionEntryVersionRecord>,
    @InjectModel(AssetRecord.name)
    private readonly assetModel: Model<AssetRecord>,
    @InjectModel(PageRecord.name)
    private readonly pageModel: Model<PageRecord>,
    @InjectModel(PageVersionRecord.name)
    private readonly pageVersionModel: Model<PageVersionRecord>,
  ) {}

  async list(workspaceId: string, siteId: string): Promise<Collection[]> {
    const records = await this.collectionModel
      .find({ workspaceId, siteId })
      .sort({ name: 1, _id: 1 })
      .exec();
    return records.map((record) => this.toCollection(record));
  }

  async get(
    workspaceId: string,
    siteId: string,
    collectionId: string,
  ): Promise<Collection> {
    return this.toCollection(
      await this.requireCollectionDocument(workspaceId, siteId, collectionId),
    );
  }

  async create(
    workspaceId: string,
    siteId: string,
    input: CreateCollectionRequest,
  ): Promise<Collection> {
    const parsed = CreateCollectionRequestSchema.parse(input);
    const fields = this.normalizeNewFields(parsed.fields);
    this.assertFieldKeys(fields, parsed.titleFieldKey);
    await this.assertReferenceTargets(workspaceId, siteId, fields);
    try {
      const record = await this.collectionModel.create({
        _id: randomUUID(),
        workspaceId,
        siteId,
        key: parsed.key,
        name: parsed.name,
        singularName: parsed.singularName,
        ...(parsed.description ? { description: parsed.description } : {}),
        fields,
        ...(parsed.titleFieldKey ? { titleFieldKey: parsed.titleFieldKey } : {}),
        status: 'active',
        schemaVersion: 1,
      });
      return this.toCollection(record);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({
          code: 'COLLECTION_KEY_CONFLICT',
          message: 'A collection with this key already exists in the site',
        });
      }
      throw error;
    }
  }

  async update(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    input: UpdateCollectionRequest,
  ): Promise<Collection> {
    const parsed = UpdateCollectionRequestSchema.parse(input);
    const record = await this.requireCollectionDocument(
      workspaceId,
      siteId,
      collectionId,
    );
    if (
      parsed.expectedSchemaVersion !== undefined &&
      parsed.expectedSchemaVersion !== record.schemaVersion
    ) {
      throw new ConflictException({
        code: 'COLLECTION_SCHEMA_CONFLICT',
        message: 'The collection schema changed while it was being edited',
      });
    }
    if (parsed.fields) {
      this.assertFieldKeys(
        parsed.fields,
        parsed.titleFieldKey === null
          ? undefined
          : (parsed.titleFieldKey ?? record.titleFieldKey),
      );
      await this.assertReferenceTargets(workspaceId, siteId, parsed.fields);
      record.fields = parsed.fields;
    }
    if (parsed.name !== undefined) record.name = parsed.name;
    if (parsed.singularName !== undefined) record.singularName = parsed.singularName;
    if (parsed.description !== undefined) {
      if (parsed.description === null) record.set('description', undefined);
      else record.description = parsed.description;
    }
    if (parsed.titleFieldKey !== undefined) {
      if (parsed.titleFieldKey === null) record.set('titleFieldKey', undefined);
      else record.titleFieldKey = parsed.titleFieldKey;
    }
    record.schemaVersion += 1;
    try {
      await record.save();
    } catch (error) {
      if (isDuplicateKeyError(error))
        throw new ConflictException({
          code: 'COLLECTION_KEY_CONFLICT',
          message: 'A collection with this key already exists in the site',
        });
      throw error;
    }
    return this.toCollection(record);
  }

  async archive(
    workspaceId: string,
    siteId: string,
    collectionId: string,
  ): Promise<void> {
    const record = await this.requireCollectionDocument(
      workspaceId,
      siteId,
      collectionId,
    );
    const usage = await this.getUsage(workspaceId, siteId, collectionId);
    if (usage.length > 0) {
      throw new ConflictException({
        code: 'COLLECTION_IN_USE',
        message:
          'Remove collection bindings and dynamic pages before archiving this collection',
        references: usage,
      });
    }
    record.status = 'archived';
    await record.save();
  }

  async getUsage(
    workspaceId: string,
    siteId: string,
    collectionId: string,
  ): Promise<Array<{ type: string; id: string; label: string }>> {
    const references: Array<{ type: string; id: string; label: string }> = [];
    const dynamicPages = await this.pageModel
      .find({ workspaceId, siteId, collectionId })
      .select({ _id: 1, name: 1 })
      .limit(2_000)
      .exec();
    references.push(
      ...dynamicPages.map((page) => ({
        type: 'dynamic-page',
        id: page._id.toString(),
        label: page.name,
      })),
    );
    const pages = await this.pageModel
      .find({ workspaceId, siteId })
      .select({ _id: 1, name: 1, currentDraftVersionId: 1, publishedVersionId: 1 })
      .limit(2_000)
      .exec();
    const pageById = new Map(pages.map((page) => [page._id.toString(), page]));
    const currentVersionIds = [
      ...new Set(
        pages.flatMap((page) =>
          [page.currentDraftVersionId, page.publishedVersionId].filter(
            (versionId): versionId is string => Boolean(versionId),
          ),
        ),
      ),
    ];
    const versions = await this.pageVersionModel
      .find({ _id: { $in: currentVersionIds }, workspaceId, siteId })
      .select({ landingPageId: 1, composition: 1 })
      .exec();
    const pageIds = new Set<string>();
    for (const version of versions) {
      const composition = PageCompositionSchema.safeParse(version.composition);
      if (!composition.success) continue;
      if (
        composition.data.queries.some(
          (query) =>
            query.source.type === 'collection' &&
            query.source.collectionId === collectionId,
        )
      )
        pageIds.add(version.landingPageId);
    }
    if (pageIds.size > 0) {
      references.push(
        ...[...pageIds]
          .map((pageId) => pageById.get(pageId))
          .filter((page): page is PageDocument => Boolean(page))
          .map((page) => ({
            type: 'page-query',
            id: page._id.toString(),
            label: page.name,
          })),
      );
    }
    return references;
  }

  async listEntries(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    input: CollectionEntryListQuery,
  ): Promise<CollectionEntryListResponse> {
    const collection = await this.requireCollection(workspaceId, siteId, collectionId);
    const query = CollectionEntryListQuerySchema.parse(input);
    const entries = await this.entryModel
      .find({
        workspaceId,
        siteId,
        collectionId,
        ...(query.status ? { status: query.status } : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .exec();
    const versions = await this.loadVersions(entries, 'draft');
    const filtered = entries.filter((entry) => {
      if (!query.search) return true;
      const version = versions.get(entry._id.toString());
      const title = collection.titleFieldKey
        ? version?.values[collection.titleFieldKey]
        : undefined;
      return String(title ?? '')
        .toLowerCase()
        .includes(query.search.toLowerCase());
    });
    const page = filtered.slice(query.offset, query.offset + query.limit);
    return CollectionEntryListResponseSchema.parse({
      items: page.map((entry) =>
        this.toEntryResponse(entry, versions.get(entry._id.toString())),
      ),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: filtered.length,
        hasNextPage: query.offset + page.length < filtered.length,
      },
    });
  }

  async getEntry(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
    mode: 'draft' | 'published' = 'draft',
  ): Promise<CollectionEntryResponse> {
    await this.requireCollection(workspaceId, siteId, collectionId);
    const entry = await this.requireEntryDocument(
      workspaceId,
      siteId,
      collectionId,
      entryId,
    );
    const versionId =
      mode === 'published' ? entry.publishedVersionId : entry.draftVersionId;
    const version = versionId
      ? await this.entryVersionModel
          .findOne({ _id: versionId, entryId, workspaceId, siteId })
          .exec()
      : null;
    if (!version)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The requested entry version was not found',
      });
    return this.toEntryResponse(entry, version);
  }

  async createEntry(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    input: CreateCollectionEntryRequest,
    actorId?: string,
  ): Promise<CollectionEntryResponse> {
    const collection = await this.requireCollection(workspaceId, siteId, collectionId);
    const parsed = CreateCollectionEntryRequestSchema.parse(input);
    const values = await this.validateValues(
      workspaceId,
      siteId,
      collection,
      parsed.values,
    );
    const entryId = randomUUID();
    const versionId = randomUUID();
    const version = await this.entryVersionModel.create({
      _id: versionId,
      workspaceId,
      siteId,
      entryId,
      collectionId,
      versionNumber: 1,
      values,
      ...(actorId ? { createdBy: actorId } : {}),
    });
    try {
      const entry = await this.entryModel.create({
        _id: entryId,
        workspaceId,
        siteId,
        collectionId,
        draftVersionId: versionId,
        status: 'draft',
      });
      return this.toEntryResponse(entry, version);
    } catch (error) {
      await version.deleteOne().catch(() => undefined);
      throw error;
    }
  }

  async updateEntry(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
    input: UpdateCollectionEntryRequest,
    actorId?: string,
  ): Promise<CollectionEntryResponse> {
    const collection = await this.requireCollection(workspaceId, siteId, collectionId);
    const parsed = UpdateCollectionEntryRequestSchema.parse(input);
    const entry = await this.requireEntryDocument(
      workspaceId,
      siteId,
      collectionId,
      entryId,
    );
    const current = entry.draftVersionId
      ? await this.entryVersionModel
          .findOne({ _id: entry.draftVersionId, entryId })
          .exec()
      : null;
    if (!current)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The entry does not have a draft version',
      });
    if (
      parsed.expectedVersionNumber !== undefined &&
      parsed.expectedVersionNumber !== current.versionNumber
    ) {
      throw new ConflictException({
        code: 'ENTRY_VERSION_CONFLICT',
        message: 'The entry changed while it was being edited',
      });
    }
    const values = await this.validateValues(
      workspaceId,
      siteId,
      collection,
      parsed.values,
      entryId,
    );
    const version = await this.entryVersionModel.create({
      _id: randomUUID(),
      workspaceId,
      siteId,
      entryId,
      collectionId,
      versionNumber: current.versionNumber + 1,
      values,
      ...(actorId ? { createdBy: actorId } : {}),
    });
    const advanced = await this.entryModel
      .findOneAndUpdate(
        { _id: entryId, workspaceId, siteId, draftVersionId: current._id.toString() },
        {
          $set: {
            draftVersionId: version._id.toString(),
            status: entry.publishedVersionId ? 'published' : 'draft',
          },
        },
        { new: true },
      )
      .exec();
    if (!advanced) {
      await version.deleteOne().catch(() => undefined);
      throw new ConflictException({
        code: 'ENTRY_VERSION_CONFLICT',
        message: 'The entry changed while it was being edited',
      });
    }
    return this.toEntryResponse(advanced, version);
  }

  async publishEntry(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
  ): Promise<CollectionEntryResponse> {
    await this.requireCollection(workspaceId, siteId, collectionId);
    const entry = await this.requireEntryDocument(
      workspaceId,
      siteId,
      collectionId,
      entryId,
    );
    if (!entry.draftVersionId)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The entry does not have a draft version',
      });
    const published = await this.entryModel
      .findOneAndUpdate(
        { _id: entryId, workspaceId, siteId, draftVersionId: entry.draftVersionId },
        { $set: { publishedVersionId: entry.draftVersionId, status: 'published' } },
        { new: true },
      )
      .exec();
    if (!published)
      throw new ConflictException({
        code: 'ENTRY_VERSION_CONFLICT',
        message: 'The entry changed while it was being published',
      });
    const version = await this.entryVersionModel
      .findOne({ _id: published.publishedVersionId, entryId })
      .exec();
    return this.toEntryResponse(published, version);
  }

  async discardDraft(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
  ): Promise<CollectionEntryResponse> {
    await this.requireCollection(workspaceId, siteId, collectionId);
    const entry = await this.requireEntryDocument(
      workspaceId,
      siteId,
      collectionId,
      entryId,
    );
    const update = entry.publishedVersionId
      ? { $set: { draftVersionId: entry.publishedVersionId, status: 'published' } }
      : { $unset: { draftVersionId: 1 }, $set: { status: 'draft' } };
    const next = await this.entryModel
      .findOneAndUpdate({ _id: entryId, workspaceId, siteId }, update, { new: true })
      .exec();
    if (!next)
      throw new NotFoundException({
        code: 'ENTRY_NOT_FOUND',
        message: 'The entry was not found',
      });
    const versionId = next.draftVersionId ?? next.publishedVersionId;
    const version = versionId
      ? await this.entryVersionModel.findOne({ _id: versionId, entryId }).exec()
      : null;
    if (!version)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The entry does not have a version',
      });
    return this.toEntryResponse(next, version);
  }

  async archiveEntry(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
  ): Promise<void> {
    await this.requireCollection(workspaceId, siteId, collectionId);
    const result = await this.entryModel
      .updateOne(
        { _id: entryId, workspaceId, siteId, collectionId },
        { $set: { status: 'archived' } },
      )
      .exec();
    if (result.matchedCount === 0)
      throw new NotFoundException({
        code: 'ENTRY_NOT_FOUND',
        message: 'The entry was not found',
      });
  }

  async query(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    input: CollectionQueryRequest,
    mode: 'draft' | 'published' = 'published',
  ): Promise<CollectionQueryResponse> {
    const collection = await this.requireCollection(workspaceId, siteId, collectionId);
    const request = CollectionQueryRequestSchema.parse(input);
    this.validateQuery(collection, request);
    const entries = await this.entryModel
      .find({
        workspaceId,
        siteId,
        collectionId,
        ...(mode === 'published'
          ? { status: 'published', publishedVersionId: { $exists: true } }
          : { status: { $ne: 'archived' } }),
      })
      .exec();
    const versions = await this.loadVersions(entries, mode);
    let rows = entries
      .map((entry) => ({ entry, version: versions.get(entry._id.toString()) }))
      .filter(
        (
          row,
        ): row is {
          entry: CollectionEntryDocument;
          version: CollectionEntryVersionDocument;
        } => Boolean(row.version),
      );
    rows = rows.filter(({ version }) =>
      request.filters.every((filter) =>
        this.matchesFilter(version.values[filter.field], filter.operator, filter.value),
      ),
    );
    for (const sort of [...request.sort].reverse())
      rows.sort(
        (left, right) =>
          compareValues(
            left.version.values[sort.field],
            right.version.values[sort.field],
          ) * (sort.direction === 'asc' ? 1 : -1),
      );
    const total = rows.length;
    const page = rows.slice(request.offset, request.offset + request.limit);
    return CollectionQueryResponseSchema.parse({
      items: page.map(({ entry, version }) => this.toEntryResponse(entry, version)),
      pagination: {
        limit: request.limit,
        offset: request.offset,
        total,
        hasNextPage: request.offset + page.length < total,
      },
    });
  }

  private validateQuery(
    collection: CollectionDefinition,
    request: CollectionQueryRequest,
  ): void {
    for (const filter of request.filters) {
      const field = collection.fields.find(
        (candidate) => candidate.key === filter.field && candidate.status === 'active',
      );
      if (!field) {
        throw new BadRequestException({
          code: 'QUERY_FIELD_INVALID',
          message: `Query field ${filter.field} is not available`,
        });
      }
      if (!queryOperatorsForField(field.type).has(filter.operator)) {
        throw new BadRequestException({
          code: 'QUERY_OPERATOR_INVALID',
          message: `Operator ${filter.operator} is not valid for ${field.type} fields`,
        });
      }
      if (filter.operator === 'exists') {
        if (filter.value !== undefined && typeof filter.value !== 'boolean') {
          throw new BadRequestException({
            code: 'QUERY_VALUE_INVALID',
            message: 'The exists operator accepts an optional boolean value',
          });
        }
        continue;
      }
      if (filter.value === undefined) {
        throw new BadRequestException({
          code: 'QUERY_VALUE_INVALID',
          message: `Operator ${filter.operator} requires a value`,
        });
      }
      const values = ['in', 'notIn'].includes(filter.operator)
        ? Array.isArray(filter.value)
          ? filter.value
          : null
        : [filter.value];
      if (!values || values.some((value) => !isQueryValueCompatible(field.type, value))) {
        throw new BadRequestException({
          code: 'QUERY_VALUE_INVALID',
          message: `The query value is not valid for ${field.type} fields`,
        });
      }
    }
    for (const sort of request.sort) {
      const field = collection.fields.find(
        (candidate) => candidate.key === sort.field && candidate.status === 'active',
      );
      if (!field || ['array', 'group', 'multi-select'].includes(field.type)) {
        throw new BadRequestException({
          code: 'QUERY_SORT_INVALID',
          message: `Sort field ${sort.field} is not a sortable collection field`,
        });
      }
    }
  }

  async resolvePublishedEntryByValue(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    field: string,
    value: string,
  ): Promise<ResolvedDataRecord | null> {
    const result = await this.query(
      workspaceId,
      siteId,
      collectionId,
      { filters: [{ field, operator: 'equals', value }], sort: [], limit: 1, offset: 0 },
      'published',
    );
    const item = result.items[0];
    return item
      ? ResolvedDataRecordSchema.parse({
          id: item.id,
          collectionId: item.collectionId,
          values: item.values,
        })
      : null;
  }

  async resolveDataContext(
    workspaceId: string,
    siteId: string,
    composition: PageComposition,
    options: { mode: 'draft' | 'published'; currentEntry?: ResolvedDataRecord },
  ): Promise<ResolvedDataContext> {
    const queryItems: Record<string, ResolvedDataRecord[]> = {};
    for (const query of composition.queries) {
      const parsed = PageQuerySchema.parse(query);
      if (parsed.source.type === 'collection') {
        const result = await this.query(
          workspaceId,
          siteId,
          parsed.source.collectionId,
          {
            filters: parsed.filters,
            sort: parsed.sort,
            limit: parsed.limit,
            offset: parsed.offset,
          },
          options.mode,
        );
        queryItems[parsed.id] = result.items.map((item) =>
          ResolvedDataRecordSchema.parse({
            id: item.id,
            collectionId: item.collectionId,
            values: item.values,
          }),
        );
      } else if (parsed.source.type === 'current-entry' && options.currentEntry) {
        queryItems[parsed.id] = [options.currentEntry];
      } else {
        queryItems[parsed.id] = [];
      }
    }
    return ResolvedDataContextSchema.parse({
      ...(options.currentEntry ? { currentEntry: options.currentEntry } : {}),
      queryItems,
      variables: {},
    });
  }

  async validateComposition(
    workspaceId: string,
    siteId: string,
    composition: PageComposition,
  ): Promise<void> {
    const parsed = PageCompositionSchema.parse(composition);
    const collectionIds = new Set<string>();
    for (const query of parsed.queries) {
      const source = DataSourceDescriptorSchema.parse(query.source);
      if (source.type === 'collection') {
        collectionIds.add(source.collectionId);
        const collection = await this.requireCollection(
          workspaceId,
          siteId,
          source.collectionId,
        );
        for (const filter of query.filters) {
          if (
            !collection.fields.some(
              (field) => field.key === filter.field && field.status === 'active',
            )
          )
            throw new BadRequestException({
              code: 'QUERY_FIELD_NOT_FOUND',
              message: `Query field ${filter.field} is not available`,
            });
        }
        for (const sort of query.sort) {
          if (
            !collection.fields.some(
              (field) => field.key === sort.field && field.status === 'active',
            )
          )
            throw new BadRequestException({
              code: 'QUERY_FIELD_NOT_FOUND',
              message: `Sort field ${sort.field} is not available`,
            });
        }
      }
    }
    for (const binding of parsed.bindings) {
      if (!safeDataPath.test(binding.source.path))
        throw new BadRequestException({
          code: 'INVALID_BINDING_PATH',
          message: 'Bindings may only address a field path such as title or author.name',
        });
      if (
        binding.source.sourceId &&
        binding.source.type === 'query-item' &&
        !parsed.queries.some((query) => query.id === binding.source.sourceId)
      )
        throw new BadRequestException({
          code: 'QUERY_NOT_FOUND',
          message: 'The binding query was not found in the page composition',
        });
      if (binding.source.type === 'current-entry' && binding.source.sourceId)
        throw new BadRequestException({
          code: 'INVALID_BINDING_SOURCE',
          message: 'Current-entry bindings cannot define sourceId',
        });
    }
    void collectionIds;
  }

  private async validateValues(
    workspaceId: string,
    siteId: string,
    collection: CollectionDefinition,
    input: Record<string, unknown>,
    exceptEntryId?: string,
  ): Promise<Record<string, unknown>> {
    const knownKeys = new Set(collection.fields.map((field) => field.key));
    for (const key of Object.keys(input))
      if (!knownKeys.has(key))
        throw new BadRequestException({
          code: 'UNKNOWN_COLLECTION_FIELD',
          message: `Unknown collection field: ${key}`,
        });
    const values: Record<string, unknown> = { ...input };
    for (const field of collection.fields) {
      if (field.status === 'archived') continue;
      if (values[field.key] === undefined && field.defaultValue !== undefined)
        values[field.key] = field.defaultValue;
      const value = values[field.key];
      if (field.required && isEmptyValue(value))
        throw new BadRequestException({
          code: 'REQUIRED_COLLECTION_FIELD',
          message: `${field.label} is required`,
        });
      if (value !== undefined && value !== null)
        await this.validateFieldValue(workspaceId, siteId, field, value);
    }
    await this.assertUniqueValues(workspaceId, siteId, collection, values, exceptEntryId);
    return values;
  }

  private async validateFieldValue(
    workspaceId: string,
    siteId: string,
    field: CollectionDefinition['fields'][number],
    value: unknown,
  ): Promise<void> {
    const stringTypes = new Set([
      'text',
      'long-text',
      'rich-text',
      'url',
      'email',
      'slug',
      'date',
      'datetime',
      'asset',
      'image',
    ]);
    if (stringTypes.has(field.type) && typeof value !== 'string')
      throw this.invalidField(field.key, 'must be a string');
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value)))
      throw this.invalidField(field.key, 'must be a finite number');
    if (field.type === 'boolean' && typeof value !== 'boolean')
      throw this.invalidField(field.key, 'must be a boolean');
    if (['array', 'multi-select'].includes(field.type) && !Array.isArray(value))
      throw this.invalidField(field.key, 'must be an array');
    if (
      field.type === 'group' &&
      (!value || typeof value !== 'object' || Array.isArray(value))
    )
      throw this.invalidField(field.key, 'must be an object');
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string))
      throw this.invalidField(field.key, 'must be a valid email');
    if (field.type === 'slug' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value as string))
      throw this.invalidField(field.key, 'must be a URL-safe slug');
    if (
      ['date', 'datetime'].includes(field.type) &&
      Number.isNaN(Date.parse(value as string))
    )
      throw this.invalidField(field.key, 'must be a valid date');
    const isImageAssetReference =
      field.type === 'image' && uuidLike.test(value as string);
    if (
      ['url', 'image'].includes(field.type) &&
      !isImageAssetReference &&
      !isSafeUrl(value as string)
    )
      throw this.invalidField(field.key, 'must be an http(s) or safe relative URL');
    if (
      field.type === 'select' &&
      field.options &&
      !field.options.some((option) => option.value === value)
    )
      throw this.invalidField(field.key, 'must match one of the configured options');
    if (
      field.type === 'multi-select' &&
      field.options &&
      !(value as unknown[]).every((item) =>
        field.options?.some((option) => option.value === item),
      )
    )
      throw this.invalidField(field.key, 'contains an invalid option');
    if (field.type === 'reference') {
      const ids = Array.isArray(value) ? value : [value];
      if (field.cardinality === 'one' && Array.isArray(value))
        throw this.invalidField(field.key, 'accepts one reference');
      if (field.cardinality === 'many' && !Array.isArray(value))
        throw this.invalidField(field.key, 'accepts an array of references');
      if (!ids.every((id) => typeof id === 'string' && uuidLike.test(id)))
        throw this.invalidField(field.key, 'contains an invalid entry id');
      const targetCount = await this.entryModel
        .countDocuments({
          _id: { $in: ids },
          workspaceId,
          siteId,
          collectionId: field.targetCollectionId,
          status: { $ne: 'archived' },
        })
        .exec();
      if (targetCount !== ids.length)
        throw this.invalidField(
          field.key,
          'references an entry outside this site or collection',
        );
    }
    if (field.type === 'asset' || field.type === 'image') {
      if (typeof value === 'string' && uuidLike.test(value)) {
        const asset = await this.assetModel
          .findOne({ _id: value, workspaceId })
          .select({ _id: 1 })
          .exec();
        if (!asset) throw this.invalidField(field.key, 'references an unavailable asset');
      }
    }
    const validation = field.validation;
    if (validation && typeof value === 'string') {
      if (validation.minLength !== undefined && value.length < validation.minLength)
        throw this.invalidField(field.key, 'is shorter than the configured minimum');
      if (validation.maxLength !== undefined && value.length > validation.maxLength)
        throw this.invalidField(field.key, 'is longer than the configured maximum');
      if (validation.pattern && !new RegExp(validation.pattern).test(value))
        throw this.invalidField(field.key, 'does not match the configured pattern');
    }
    if (validation && typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min)
        throw this.invalidField(field.key, 'is below the configured minimum');
      if (validation.max !== undefined && value > validation.max)
        throw this.invalidField(field.key, 'is above the configured maximum');
      if (validation.integer && !Number.isInteger(value))
        throw this.invalidField(field.key, 'must be an integer');
    }
    if (validation && Array.isArray(value)) {
      if (validation.minItems !== undefined && value.length < validation.minItems)
        throw this.invalidField(field.key, 'has too few items');
      if (validation.maxItems !== undefined && value.length > validation.maxItems)
        throw this.invalidField(field.key, 'has too many items');
    }
    void siteId;
  }

  private async assertUniqueValues(
    workspaceId: string,
    siteId: string,
    collection: CollectionDefinition,
    values: Record<string, unknown>,
    exceptEntryId?: string,
  ): Promise<void> {
    const uniqueFields = collection.fields.filter(
      (field) => field.unique && values[field.key] !== undefined,
    );
    if (uniqueFields.length === 0) return;
    const entries = await this.entryModel
      .find({
        workspaceId,
        siteId,
        collectionId: collection.id,
        ...(exceptEntryId ? { _id: { $ne: exceptEntryId } } : {}),
        status: { $ne: 'archived' },
      })
      .select({ _id: 1, draftVersionId: 1 })
      .limit(10_000)
      .exec();
    const versions = await this.loadVersions(entries, 'draft');
    for (const field of uniqueFields) {
      if (
        [...versions.values()].some(
          (version) => compareValues(version.values[field.key], values[field.key]) === 0,
        )
      )
        throw new ConflictException({
          code: 'UNIQUE_COLLECTION_FIELD',
          message: `${field.label} must be unique`,
        });
    }
  }

  private normalizeNewFields(
    fields: CreateCollectionRequest['fields'],
  ): CollectionDefinition['fields'] {
    return fields.map((field) => ({ ...field, id: randomUUID() }));
  }

  private assertFieldKeys(
    fields: CollectionDefinition['fields'],
    titleFieldKey?: string,
  ): void {
    const keys = new Set<string>();
    for (const field of fields) {
      if (keys.has(field.key))
        throw new BadRequestException({
          code: 'DUPLICATE_COLLECTION_FIELD',
          message: `Field keys must be unique: ${field.key}`,
        });
      keys.add(field.key);
      if (
        field.type === 'slug' &&
        field.slugFromFieldKey &&
        !fields.some((candidate) => candidate.key === field.slugFromFieldKey)
      )
        throw new BadRequestException({
          code: 'SLUG_SOURCE_NOT_FOUND',
          message: `Slug source field was not found: ${field.slugFromFieldKey}`,
        });
    }
    if (titleFieldKey && !keys.has(titleFieldKey))
      throw new BadRequestException({
        code: 'TITLE_FIELD_NOT_FOUND',
        message: `Title field was not found: ${titleFieldKey}`,
      });
  }

  private async assertReferenceTargets(
    workspaceId: string,
    siteId: string,
    fields: CollectionDefinition['fields'],
  ): Promise<void> {
    const ids = fields.flatMap((field) =>
      field.targetCollectionId ? [field.targetCollectionId] : [],
    );
    if (ids.length === 0) return;
    const count = await this.collectionModel
      .countDocuments({ _id: { $in: ids }, workspaceId, siteId })
      .exec();
    if (count !== new Set(ids).size)
      throw new BadRequestException({
        code: 'REFERENCE_COLLECTION_NOT_FOUND',
        message: 'A reference field targets a collection outside this site',
      });
  }

  private async requireCollection(
    workspaceId: string,
    siteId: string,
    collectionId: string,
  ): Promise<CollectionDefinition> {
    return this.toCollection(
      await this.requireCollectionDocument(workspaceId, siteId, collectionId),
    );
  }

  private async requireCollectionDocument(
    workspaceId: string,
    siteId: string,
    collectionId: string,
  ): Promise<CollectionDocument> {
    const record = await this.collectionModel
      .findOne({ _id: collectionId, workspaceId, siteId, status: { $ne: 'archived' } })
      .exec();
    if (!record)
      throw new NotFoundException({
        code: 'COLLECTION_NOT_FOUND',
        message: `Collection ${collectionId} was not found`,
      });
    return record;
  }

  private async requireEntryDocument(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
  ): Promise<CollectionEntryDocument> {
    const entry = await this.entryModel
      .findOne({ _id: entryId, workspaceId, siteId, collectionId })
      .exec();
    if (!entry)
      throw new NotFoundException({
        code: 'ENTRY_NOT_FOUND',
        message: `Entry ${entryId} was not found`,
      });
    return entry;
  }

  private async loadVersions(
    entries: CollectionEntryDocument[],
    mode: 'draft' | 'published',
  ): Promise<Map<string, CollectionEntryVersionDocument>> {
    const ids = entries
      .map((entry) =>
        mode === 'published' ? entry.publishedVersionId : entry.draftVersionId,
      )
      .filter((id): id is string => Boolean(id));
    const records =
      ids.length > 0
        ? await this.entryVersionModel.find({ _id: { $in: ids } }).exec()
        : [];
    const byId = new Map(records.map((record) => [record._id.toString(), record]));
    return new Map(
      entries.flatMap((entry) => {
        const id = mode === 'published' ? entry.publishedVersionId : entry.draftVersionId;
        const version = id ? byId.get(id) : undefined;
        return version ? [[entry._id.toString(), version] as const] : [];
      }),
    );
  }

  private toCollection(record: CollectionDocument): CollectionDefinition {
    return CollectionDefinitionSchema.parse({
      id: record._id.toString(),
      workspaceId: record.workspaceId,
      siteId: record.siteId,
      key: record.key,
      name: record.name,
      singularName: record.singularName,
      ...(record.description ? { description: record.description } : {}),
      fields: record.fields,
      ...(record.titleFieldKey ? { titleFieldKey: record.titleFieldKey } : {}),
      status: record.status,
      schemaVersion: record.schemaVersion,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private toEntryResponse(
    entry: CollectionEntryDocument,
    version?: CollectionEntryVersionDocument | null,
  ): CollectionEntryResponse {
    if (!version)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The entry does not have a version',
      });
    return CollectionEntryResponseSchema.parse({
      id: entry._id.toString(),
      workspaceId: entry.workspaceId,
      siteId: entry.siteId,
      collectionId: entry.collectionId,
      ...(entry.draftVersionId ? { draftVersionId: entry.draftVersionId } : {}),
      ...(entry.publishedVersionId
        ? { publishedVersionId: entry.publishedVersionId }
        : {}),
      status: entry.status,
      values: version.values,
      versionNumber: version.versionNumber,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    });
  }

  private matchesFilter(value: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'equals':
        return compareValues(value, expected) === 0;
      case 'notEquals':
        return compareValues(value, expected) !== 0;
      case 'contains':
        return (
          typeof value === 'string' &&
          value.toLowerCase().includes(String(expected ?? '').toLowerCase())
        );
      case 'startsWith':
        return (
          typeof value === 'string' &&
          value.toLowerCase().startsWith(String(expected ?? '').toLowerCase())
        );
      case 'gt':
        return compareValues(value, expected) > 0;
      case 'gte':
        return compareValues(value, expected) >= 0;
      case 'lt':
        return compareValues(value, expected) < 0;
      case 'lte':
        return compareValues(value, expected) <= 0;
      case 'in':
        return (
          Array.isArray(expected) &&
          expected.some((item) => compareValues(value, item) === 0)
        );
      case 'notIn':
        return (
          Array.isArray(expected) &&
          expected.every((item) => compareValues(value, item) !== 0)
        );
      case 'exists':
        return expected === undefined
          ? value !== undefined
          : Boolean(expected)
            ? value !== undefined
            : value === undefined;
      default:
        return false;
    }
  }

  private invalidField(field: string, message: string): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_COLLECTION_FIELD',
      message: `${field} ${message}`,
    });
  }
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isSafeUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function compareValues(left: unknown, right: unknown): number {
  const a = Array.isArray(left) ? JSON.stringify(left) : left;
  const b = Array.isArray(right) ? JSON.stringify(right) : right;
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  const leftNumber = typeof a === 'number' ? a : Number.NaN;
  const rightNumber = typeof b === 'number' ? b : Number.NaN;
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber))
    return leftNumber - rightNumber;
  return String(a).localeCompare(String(b));
}

function queryOperatorsForField(
  type: CollectionDefinition['fields'][number]['type'],
): Set<string> {
  const common = ['equals', 'notEquals', 'exists'];
  if (
    [
      'text',
      'long-text',
      'rich-text',
      'url',
      'email',
      'slug',
      'date',
      'datetime',
    ].includes(type)
  ) {
    return new Set([...common, 'contains', 'startsWith', 'in', 'notIn']);
  }
  if (type === 'number')
    return new Set([...common, 'gt', 'gte', 'lt', 'lte', 'in', 'notIn']);
  if (type === 'boolean') return new Set(common);
  if (['select', 'multi-select', 'reference', 'asset', 'image'].includes(type)) {
    return new Set([...common, 'in', 'notIn']);
  }
  return new Set(common);
}

function isQueryValueCompatible(
  type: CollectionDefinition['fields'][number]['type'],
  value: unknown,
): boolean {
  if (['number'].includes(type))
    return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (['array', 'group'].includes(type)) return true;
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000,
  );
}
