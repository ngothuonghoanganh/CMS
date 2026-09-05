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
  DiscardCollectionEntryResponseSchema,
  CollectionQueryRequestSchema,
  CollectionQueryResponseSchema,
  CreateCollectionEntryRequestSchema,
  CreateCollectionRequestSchema,
  DataSourceDescriptorSchema,
  PageCompositionSchema,
  PageQuerySchema,
  ResolvedDataContextSchema,
  ResolvedDataRecordSchema,
  TemplateCompositionSchema,
  UpdateCollectionEntryRequestSchema,
  UpdateCollectionRequestSchema,
  isQueryValueCompatibleForFieldType,
  normalizeCollectionSlug,
  queryOperatorsForFieldType,
  type Collection,
  type CollectionDefinition,
  type CollectionEntryListQuery,
  type CollectionEntryListResponse,
  type CollectionEntryResponse,
  type DiscardCollectionEntryResponse,
  type CollectionUsageReference,
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
import {
  TemplateRecord,
  TemplateVersionRecord,
} from '../persistence/schemas/template.schema';

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
    @InjectModel(TemplateRecord.name)
    private readonly templateModel: Model<TemplateRecord>,
    @InjectModel(TemplateVersionRecord.name)
    private readonly templateVersionModel: Model<TemplateVersionRecord>,
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
      const nextFields = parsed.fields;
      const previousFields = this.toCollection(record).fields;
      const nextFieldIds = new Set(nextFields.map((field) => field.id));
      const changedFields = previousFields.filter((field) => {
        const next = nextFields.find((candidate) => candidate.id === field.id);
        return (
          !nextFieldIds.has(field.id) ||
          !next ||
          next.key !== field.key ||
          next.type !== field.type ||
          next.status !== field.status
        );
      });
      for (const field of changedFields) {
        const usage = await this.getUsage(workspaceId, siteId, collectionId, {
          fieldId: field.id,
          fieldKey: field.key,
        });
        if (usage.length > 0) {
          throw new ConflictException({
            code: 'COLLECTION_FIELD_IN_USE',
            message: `Field ${field.key} is used by published or draft page content`,
            details: {
              fieldId: field.id,
              fieldKey: field.key,
              references: usage,
            },
          });
        }
      }
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
        details: { references: usage },
      });
    }
    record.status = 'archived';
    await record.save();
  }

  async getUsage(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    field?: { fieldId: string; fieldKey: string },
  ): Promise<CollectionUsageReference[]> {
    const references: CollectionUsageReference[] = [];
    const withField = (
      reference: Omit<CollectionUsageReference, 'fieldId' | 'fieldKey'>,
    ) =>
      field
        ? { ...reference, fieldId: field.fieldId, fieldKey: field.fieldKey }
        : reference;
    const dynamicPages = await this.pageModel
      .find({
        workspaceId,
        siteId,
        collectionId,
        ...(field ? { lookupField: field.fieldKey } : {}),
      })
      .select({ _id: 1, name: 1 })
      .exec();
    references.push(
      ...dynamicPages.map((page) => ({
        type: 'dynamic-page',
        id: page._id.toString(),
        label: page.name,
        ...(field ? { fieldId: field.fieldId, fieldKey: field.fieldKey } : {}),
      })),
    );
    const pages = await this.pageModel
      .find({ workspaceId, siteId })
      .select({ _id: 1, name: 1, currentDraftVersionId: 1, publishedVersionId: 1 })
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
      const collectionQueryIds = new Set(
        composition.data.queries
          .filter(
            (query) =>
              query.source.type === 'collection' &&
              query.source.collectionId === collectionId,
          )
          .map((query) => query.id),
      );
      const queryIds = new Set(
        composition.data.queries
          .filter(
            (query) =>
              collectionQueryIds.has(query.id) &&
              (!field ||
                query.filters.some((filter) => filter.field === field.fieldKey) ||
                query.sort.some((sort) => sort.field === field.fieldKey)),
          )
          .map((query) => query.id),
      );
      const usesFieldInBinding = field
        ? composition.data.bindings.some(
            (binding) =>
              binding.source.path.split('.')[0] === field.fieldKey &&
              ((binding.source.type === 'current-entry' &&
                pages.find((page) => page._id.toString() === version.landingPageId)
                  ?.collectionId === collectionId) ||
                (binding.source.type === 'query-item' &&
                  binding.source.sourceId &&
                  collectionQueryIds.has(binding.source.sourceId))),
          )
        : false;
      if (queryIds.size > 0 || usesFieldInBinding) pageIds.add(version.landingPageId);
    }
    references.push(
      ...[...pageIds]
        .map((pageId) => pageById.get(pageId))
        .filter((page): page is PageDocument => Boolean(page))
        .map((page) =>
          withField({
            type: 'page-query',
            id: page._id.toString(),
            label: page.name,
          }),
        ),
    );

    // Templates can be global to a workspace or scoped to this site. Only the
    // latest draft and published template versions are relevant; older
    // immutable snapshots cannot be selected by the editor.
    const templates = await this.templateModel
      .find({
        workspaceId,
        $or: [{ siteId }, { siteId: { $exists: false } }],
      })
      .select({ _id: 1, name: 1, latestVersionId: 1, publishedVersionId: 1 })
      .exec();
    const templateVersionIds = [
      ...new Set(
        templates.flatMap((template) =>
          [template.latestVersionId, template.publishedVersionId].filter(
            (versionId): versionId is string => Boolean(versionId),
          ),
        ),
      ),
    ];
    if (templateVersionIds.length > 0) {
      const templateVersions = await this.templateVersionModel
        .find({ _id: { $in: templateVersionIds } })
        .select({ templateId: 1, versionNumber: 1, composition: 1 })
        .exec();
      const templateById = new Map(
        templates.map((template) => [template._id.toString(), template]),
      );
      for (const version of templateVersions) {
        const composition = TemplateCompositionSchema.safeParse(version.composition);
        const template = templateById.get(version.templateId.toString());
        if (!composition.success || !template) continue;
        const usesCollection = composition.data.queries.some(
          (query) =>
            query.source.type === 'collection' &&
            query.source.collectionId === collectionId &&
            (!field ||
              query.filters.some((filter) => filter.field === field.fieldKey) ||
              query.sort.some((sort) => sort.field === field.fieldKey)),
        );
        const usesBinding = field
          ? composition.data.bindings.some(
              (binding) =>
                binding.source.path.split('.')[0] === field.fieldKey &&
                (binding.source.type === 'current-entry' ||
                  (binding.source.type === 'query-item' &&
                    composition.data.queries.some(
                      (query) =>
                        query.id === binding.source.sourceId &&
                        query.source.type === 'collection' &&
                        query.source.collectionId === collectionId,
                    ))),
            )
          : false;
        if (usesCollection || usesBinding) {
          references.push(
            withField({
              type: 'template',
              id: template._id.toString(),
              label: `${template.name} · v${version.versionNumber}`,
            }),
          );
        }
      }
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
    if (query.sortField) {
      const sortField = collection.fields.find(
        (field) => field.key === query.sortField && field.status === 'active',
      );
      if (!sortField || ['array', 'group', 'multi-select'].includes(sortField.type)) {
        throw new BadRequestException({
          code: 'ENTRY_SORT_FIELD_INVALID',
          message: `Sort field ${query.sortField} is not a sortable collection field`,
        });
      }
    }
    const filter: Record<string, unknown> = {
      workspaceId,
      siteId,
      collectionId,
      ...(query.status ? { status: query.status } : {}),
    };
    if (query.search) {
      filter.draftSearchText = {
        $regex: escapeRegex(query.search.trim().toLowerCase()),
      };
    }
    const sort: Record<string, 1 | -1> = query.sortField
      ? {
          [`draftValues.${query.sortField}`]: query.sortDirection === 'asc' ? 1 : -1,
          _id: 1,
        }
      : { createdAt: -1, _id: -1 };
    const [entries, total] = await Promise.all([
      this.entryModel
        .find(filter)
        .sort(sort)
        .skip(query.offset)
        .limit(query.limit)
        .exec(),
      this.entryModel.countDocuments(filter).exec(),
    ]);
    const versions = await this.loadVersions(entries, 'draft', workspaceId, siteId);
    return CollectionEntryListResponseSchema.parse({
      items: entries.map((entry) =>
        this.toEntryResponse(entry, versions.get(entry._id.toString())),
      ),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + entries.length < total,
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
    const validated = await this.validateValues(
      workspaceId,
      siteId,
      collection,
      parsed.values,
    );
    const { values, autoSlugSourceValues } = validated;
    const uniqueTokens = buildUniqueTokens(collection, values);
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
        draftValues: values,
        draftSearchText: searchTextForValues(values),
        ...(Object.keys(autoSlugSourceValues).length ? { autoSlugSourceValues } : {}),
        ...(uniqueTokens.length ? { uniqueTokens } : {}),
        status: 'draft',
      });
      return this.toEntryResponse(entry, version);
    } catch (error) {
      await version.deleteOne().catch(() => undefined);
      if (isDuplicateKeyError(error)) {
        throw new ConflictException({
          code: 'UNIQUE_COLLECTION_FIELD',
          message: 'An entry already uses one of the unique field values',
        });
      }
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
          .findOne({
            _id: entry.draftVersionId,
            entryId,
            collectionId,
            workspaceId,
            siteId,
          })
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
    const validated = await this.validateValues(
      workspaceId,
      siteId,
      collection,
      parsed.values,
      entryId,
      entry.autoSlugSourceValues,
    );
    const { values, autoSlugSourceValues } = validated;
    const uniqueTokens = buildUniqueTokens(collection, values);
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
            draftValues: values,
            draftSearchText: searchTextForValues(values),
            ...(Object.keys(autoSlugSourceValues).length ? { autoSlugSourceValues } : {}),
            ...(uniqueTokens.length ? { uniqueTokens } : {}),
            status: entry.publishedVersionId ? 'published' : 'draft',
          },
          ...(!uniqueTokens.length || !Object.keys(autoSlugSourceValues).length
            ? {
                $unset: {
                  ...(!uniqueTokens.length ? { uniqueTokens: 1 } : {}),
                  ...(!Object.keys(autoSlugSourceValues).length
                    ? { autoSlugSourceValues: 1 }
                    : {}),
                },
              }
            : {}),
        },
        { new: true },
      )
      .exec()
      .catch(async (error) => {
        await version.deleteOne().catch(() => undefined);
        if (isDuplicateKeyError(error)) {
          throw new ConflictException({
            code: 'UNIQUE_COLLECTION_FIELD',
            message: 'An entry already uses one of the unique field values',
          });
        }
        throw error;
      });
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
    const collection = await this.requireCollection(workspaceId, siteId, collectionId);
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
    const draftVersion = await this.entryVersionModel
      .findOne({
        _id: entry.draftVersionId,
        entryId,
        collectionId,
        workspaceId,
        siteId,
      })
      .exec();
    if (!draftVersion)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The entry draft version was not found',
      });
    const validated = await this.validateValues(
      workspaceId,
      siteId,
      collection,
      draftVersion.values,
      entryId,
      entry.autoSlugSourceValues,
    );
    const { values, autoSlugSourceValues } = validated;
    const uniqueTokens = buildUniqueTokens(collection, values);
    let publishVersion = draftVersion;
    if (JSON.stringify(values) !== JSON.stringify(draftVersion.values)) {
      try {
        publishVersion = await this.entryVersionModel.create({
          _id: randomUUID(),
          workspaceId,
          siteId,
          entryId,
          collectionId,
          versionNumber: draftVersion.versionNumber + 1,
          values,
        });
        const advancedDraft = await this.entryModel
          .findOneAndUpdate(
            {
              _id: entryId,
              workspaceId,
              siteId,
              draftVersionId: draftVersion._id.toString(),
            },
            {
              $set: {
                draftVersionId: publishVersion._id.toString(),
                draftValues: values,
                draftSearchText: searchTextForValues(values),
                ...(Object.keys(autoSlugSourceValues).length
                  ? { autoSlugSourceValues }
                  : {}),
              },
              ...(!Object.keys(autoSlugSourceValues).length
                ? { $unset: { autoSlugSourceValues: 1 } }
                : {}),
            },
            { new: true },
          )
          .exec();
        if (!advancedDraft) {
          await publishVersion.deleteOne().catch(() => undefined);
          throw new ConflictException({
            code: 'ENTRY_VERSION_CONFLICT',
            message: 'The entry changed while it was being prepared for publishing',
          });
        }
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new ConflictException({
            code: 'UNIQUE_COLLECTION_FIELD',
            message: 'An entry already uses one of the unique field values',
          });
        }
        throw error;
      }
    }
    const draftVersionId = publishVersion._id.toString();
    const published = await this.entryModel
      .findOneAndUpdate(
        { _id: entryId, workspaceId, siteId, draftVersionId },
        {
          $set: {
            publishedVersionId: draftVersionId,
            publishedValues: values,
            publishedSearchText: searchTextForValues(values),
            ...(Object.keys(autoSlugSourceValues).length ? { autoSlugSourceValues } : {}),
            ...(uniqueTokens.length ? { uniqueTokens } : {}),
            status: 'published',
          },
          ...(!uniqueTokens.length || !Object.keys(autoSlugSourceValues).length
            ? {
                $unset: {
                  ...(!uniqueTokens.length ? { uniqueTokens: 1 } : {}),
                  ...(!Object.keys(autoSlugSourceValues).length
                    ? { autoSlugSourceValues: 1 }
                    : {}),
                },
              }
            : {}),
        },
        { new: true },
      )
      .exec()
      .catch((error) => {
        if (isDuplicateKeyError(error)) {
          throw new ConflictException({
            code: 'UNIQUE_COLLECTION_FIELD',
            message: 'An entry already uses one of the unique field values',
          });
        }
        throw error;
      });
    if (!published)
      throw new ConflictException({
        code: 'ENTRY_VERSION_CONFLICT',
        message: 'The entry changed while it was being published',
      });
    return this.toEntryResponse(published, publishVersion);
  }

  async discardDraft(
    workspaceId: string,
    siteId: string,
    collectionId: string,
    entryId: string,
  ): Promise<CollectionEntryResponse | DiscardCollectionEntryResponse> {
    await this.requireCollection(workspaceId, siteId, collectionId);
    const entry = await this.requireEntryDocument(
      workspaceId,
      siteId,
      collectionId,
      entryId,
    );
    if (!entry.publishedVersionId) {
      await this.entryModel.deleteOne({ _id: entryId, workspaceId, siteId }).exec();
      await this.entryVersionModel.deleteMany({ entryId, workspaceId, siteId }).exec();
      return DiscardCollectionEntryResponseSchema.parse({ entryId, deleted: true });
    }
    const publishedVersion = await this.entryVersionModel
      .findOne({
        _id: entry.publishedVersionId,
        entryId,
        workspaceId,
        siteId,
      })
      .exec();
    if (!publishedVersion)
      throw new NotFoundException({
        code: 'ENTRY_VERSION_NOT_FOUND',
        message: 'The published entry version was not found',
      });
    const update = {
      $set: {
        draftVersionId: entry.publishedVersionId,
        draftValues: publishedVersion.values,
        draftSearchText: searchTextForValues(publishedVersion.values),
        ...(entry.autoSlugSourceValues
          ? { autoSlugSourceValues: entry.autoSlugSourceValues }
          : {}),
        status: 'published',
      },
    };
    const next = await this.entryModel
      .findOneAndUpdate({ _id: entryId, workspaceId, siteId }, update, { new: true })
      .exec();
    if (!next)
      throw new NotFoundException({
        code: 'ENTRY_NOT_FOUND',
        message: 'The entry was not found',
      });
    return this.toEntryResponse(next, publishedVersion);
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
    const projectionName = mode === 'published' ? 'publishedValues' : 'draftValues';
    const conditions: Record<string, unknown>[] = [
      {
        workspaceId,
        siteId,
        collectionId,
        ...(mode === 'published'
          ? { status: 'published', publishedVersionId: { $exists: true } }
          : { status: { $ne: 'archived' }, draftVersionId: { $exists: true } }),
      },
    ];
    conditions.push(
      ...request.filters.map((filter) => mongoFilterCondition(projectionName, filter)),
    );
    const databaseFilter =
      conditions.length === 1 ? conditions[0]! : { $and: conditions };
    const sort = Object.fromEntries([
      ...request.sort.map((item) => [
        `${projectionName}.${item.field}`,
        item.direction === 'asc' ? 1 : -1,
      ]),
      ['_id', 1],
    ]) as Record<string, 1 | -1>;
    const [entries, total] = await Promise.all([
      this.entryModel
        .find(databaseFilter)
        .sort(sort)
        .skip(request.offset)
        .limit(request.limit)
        .exec(),
      this.entryModel.countDocuments(databaseFilter).exec(),
    ]);
    const versions = await this.loadVersions(entries, mode, workspaceId, siteId);
    return CollectionQueryResponseSchema.parse({
      items: entries.map((entry) =>
        this.toEntryResponse(entry, versions.get(entry._id.toString())),
      ),
      pagination: {
        limit: request.limit,
        offset: request.offset,
        total,
        hasNextPage: request.offset + entries.length < total,
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
      if (!queryOperatorsForFieldType(field.type).includes(filter.operator)) {
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
      if (
        !values ||
        values.some((value) => !isQueryValueCompatibleForFieldType(field.type, value))
      ) {
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
    const resolvedQueries = await Promise.all(
      composition.queries.map(async (query) => {
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
          return [
            parsed.id,
            result.items.map((item) =>
              ResolvedDataRecordSchema.parse({
                id: item.id,
                collectionId: item.collectionId,
                values: item.values,
              }),
            ),
          ] as const;
        }
        return [
          parsed.id,
          parsed.source.type === 'current-entry' && options.currentEntry
            ? [options.currentEntry]
            : [],
        ] as const;
      }),
    );
    const queryItems = Object.fromEntries(resolvedQueries);
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
    options: { currentEntryCollectionId?: string } = {},
  ): Promise<void> {
    const parsed = PageCompositionSchema.parse(composition);
    const queryCollections = new Map<string, CollectionDefinition>();
    for (const query of parsed.queries) {
      const source = DataSourceDescriptorSchema.parse(query.source);
      if (source.type === 'collection') {
        const collection = await this.requireCollection(
          workspaceId,
          siteId,
          source.collectionId,
        );
        queryCollections.set(query.id, collection);
        this.validateQuery(collection, {
          filters: query.filters,
          sort: query.sort,
          limit: query.limit,
          offset: query.offset,
        });
      } else if (source.type === 'current-entry') {
        if (!options.currentEntryCollectionId) {
          throw new BadRequestException({
            code: 'CURRENT_ENTRY_CONTEXT_REQUIRED',
            message: 'Current-entry queries are only valid on dynamic pages',
          });
        }
        if (
          source.collectionId &&
          source.collectionId !== options.currentEntryCollectionId
        ) {
          throw new BadRequestException({
            code: 'CURRENT_ENTRY_COLLECTION_INVALID',
            message:
              'The current-entry query collection does not match the page collection',
          });
        }
        const collection = await this.requireCollection(
          workspaceId,
          siteId,
          source.collectionId ?? options.currentEntryCollectionId,
        );
        queryCollections.set(query.id, collection);
        this.validateQuery(collection, {
          filters: query.filters,
          sort: query.sort,
          limit: query.limit,
          offset: query.offset,
        });
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
      if (binding.source.type === 'current-entry') {
        if (!options.currentEntryCollectionId) {
          throw new BadRequestException({
            code: 'CURRENT_ENTRY_CONTEXT_REQUIRED',
            message: 'Current-entry bindings are only valid on dynamic pages',
          });
        }
        const fieldKey = binding.source.path.split('.')[0];
        const collection = await this.requireCollection(
          workspaceId,
          siteId,
          options.currentEntryCollectionId,
        );
        if (
          !collection.fields.some(
            (field) => field.key === fieldKey && field.status === 'active',
          )
        ) {
          throw new BadRequestException({
            code: 'BINDING_FIELD_NOT_FOUND',
            message: `Current-entry field ${fieldKey} is not available`,
          });
        }
      }
      if (binding.source.type === 'query-item') {
        const query = parsed.queries.find(
          (candidate) => candidate.id === binding.source.sourceId,
        );
        const collection = query ? queryCollections.get(query.id) : undefined;
        if (collection) {
          const fieldKey = binding.source.path.split('.')[0];
          if (
            !collection.fields.some(
              (field) => field.key === fieldKey && field.status === 'active',
            )
          ) {
            throw new BadRequestException({
              code: 'BINDING_FIELD_NOT_FOUND',
              message: `Binding field ${fieldKey} is not available`,
            });
          }
        }
      }
    }
  }

  private async validateValues(
    workspaceId: string,
    siteId: string,
    collection: CollectionDefinition,
    input: Record<string, unknown>,
    exceptEntryId?: string,
    previousAutoSlugSourceValues?: Record<string, string>,
  ): Promise<{
    values: Record<string, unknown>;
    autoSlugSourceValues: Record<string, string>;
  }> {
    const knownKeys = new Set(collection.fields.map((field) => field.key));
    for (const key of Object.keys(input))
      if (!knownKeys.has(key))
        throw new BadRequestException({
          code: 'UNKNOWN_COLLECTION_FIELD',
          message: `Unknown collection field: ${key}`,
        });
    const values: Record<string, unknown> = { ...input };
    const autoSlugSourceValues: Record<string, string> = {
      ...(previousAutoSlugSourceValues ?? {}),
    };
    for (const field of collection.fields) {
      if (field.status === 'archived' || field.type !== 'slug' || !field.slugFromFieldKey)
        continue;
      const sourceValue = values[field.slugFromFieldKey];
      const source = typeof sourceValue === 'string' ? sourceValue : '';
      const currentValue = values[field.key];
      const previousSource = previousAutoSlugSourceValues?.[field.key];
      const wasPreviouslyAutomatic =
        previousSource !== undefined &&
        currentValue === normalizeCollectionSlug(previousSource);
      const shouldGenerate =
        !field.manualSlugOverride || isEmptyValue(currentValue) || wasPreviouslyAutomatic;
      if (shouldGenerate) {
        const generated = normalizeCollectionSlug(source);
        if (generated) values[field.key] = generated;
        else delete values[field.key];
        if (source) autoSlugSourceValues[field.key] = source;
        else delete autoSlugSourceValues[field.key];
      } else {
        delete autoSlugSourceValues[field.key];
      }
    }
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
    return { values, autoSlugSourceValues };
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
      if (validation.pattern) {
        try {
          if (!new RegExp(validation.pattern).test(value))
            throw this.invalidField(field.key, 'does not match the configured pattern');
        } catch (error) {
          if (error instanceof BadRequestException) throw error;
          throw this.invalidField(field.key, 'uses an invalid or unsafe pattern');
        }
      }
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
      (field) =>
        field.unique && field.status === 'active' && !isEmptyValue(values[field.key]),
    );
    if (uniqueFields.length === 0) return;
    await Promise.all(
      uniqueFields.map(async (field) => {
        const conflict = await this.entryModel.exists({
          workspaceId,
          siteId,
          collectionId: collection.id,
          status: { $ne: 'archived' },
          uniqueTokens: uniqueTokenForField(field, values[field.key]),
          ...(exceptEntryId ? { _id: { $ne: exceptEntryId } } : {}),
        });
        if (conflict)
          throw new ConflictException({
            code: 'UNIQUE_COLLECTION_FIELD',
            message: `${field.label} must be unique`,
          });
      }),
    );
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
    workspaceId?: string,
    siteId?: string,
  ): Promise<Map<string, CollectionEntryVersionDocument>> {
    const ids = entries
      .map((entry) =>
        mode === 'published' ? entry.publishedVersionId : entry.draftVersionId,
      )
      .filter((id): id is string => Boolean(id));
    const records =
      ids.length > 0
        ? await this.entryVersionModel
            .find({
              _id: { $in: ids },
              ...(workspaceId ? { workspaceId } : {}),
              ...(siteId ? { siteId } : {}),
            })
            .exec()
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchTextForValues(values: Record<string, unknown>): string {
  return JSON.stringify(values).toLowerCase().slice(0, 20_000);
}

function normalizeUniqueValue(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function uniqueTokenForField(
  field: CollectionDefinition['fields'][number],
  value: unknown,
): string {
  return `${field.id}:${encodeURIComponent(normalizeUniqueValue(value))}`;
}

function buildUniqueTokens(
  collection: CollectionDefinition,
  values: Record<string, unknown>,
): string[] {
  return collection.fields
    .filter(
      (field) =>
        field.unique && field.status === 'active' && !isEmptyValue(values[field.key]),
    )
    .map((field) => uniqueTokenForField(field, values[field.key]));
}

function mongoFilterCondition(
  projectionName: 'draftValues' | 'publishedValues',
  filter: CollectionQueryRequest['filters'][number],
): Record<string, unknown> {
  const path = `${projectionName}.${filter.field}`;
  const value = filter.value;
  switch (filter.operator) {
    case 'equals':
      return { [path]: value };
    case 'notEquals':
      return { [path]: { $ne: value } };
    case 'contains':
      return { [path]: { $regex: escapeRegex(String(value ?? '')), $options: 'i' } };
    case 'startsWith':
      return {
        [path]: { $regex: `^${escapeRegex(String(value ?? ''))}`, $options: 'i' },
      };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { [path]: { [`$${filter.operator}`]: value } };
    case 'in':
      return { [path]: { $in: Array.isArray(value) ? value : [value] } };
    case 'notIn':
      return { [path]: { $nin: Array.isArray(value) ? value : [value] } };
    case 'exists':
      return { [path]: { $exists: value === undefined ? true : value === true } };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000,
  );
}
