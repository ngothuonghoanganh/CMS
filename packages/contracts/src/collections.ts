import { z } from 'zod';

const entityId = z.string().uuid();
const key = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/);
const nonEmpty = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });

export const CollectionFieldTypeSchema = z.enum([
  'text',
  'long-text',
  'rich-text',
  'number',
  'boolean',
  'date',
  'datetime',
  'asset',
  'image',
  'url',
  'email',
  'slug',
  'select',
  'multi-select',
  'reference',
  'array',
  'group',
]);
export type CollectionFieldType = z.infer<typeof CollectionFieldTypeSchema>;

export const CollectionFieldStatusSchema = z.enum(['active', 'archived']);
export type CollectionFieldStatus = z.infer<typeof CollectionFieldStatusSchema>;

export const CollectionFieldOptionSchema = z
  .object({ label: nonEmpty.max(160), value: z.string().trim().min(1).max(160) })
  .strict();
export type CollectionFieldOption = z.infer<typeof CollectionFieldOptionSchema>;

export const CollectionFieldValidationSchema = z
  .object({
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    pattern: z.string().trim().max(200).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    integer: z.boolean().optional(),
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
    options: z.array(CollectionFieldOptionSchema).max(200).optional(),
    allowedMimeTypes: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    maxFileSize: z.number().int().positive().max(1_000_000_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.minLength !== undefined &&
      value.maxLength !== undefined &&
      value.minLength > value.maxLength
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxLength'],
        message: 'maxLength must be >= minLength',
      });
    }
    if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
      context.addIssue({ code: 'custom', path: ['max'], message: 'max must be >= min' });
    }
    if (
      value.minItems !== undefined &&
      value.maxItems !== undefined &&
      value.minItems > value.maxItems
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxItems'],
        message: 'maxItems must be >= minItems',
      });
    }
  });
export type CollectionFieldValidation = z.infer<typeof CollectionFieldValidationSchema>;

export const CollectionFieldUiSchema = z
  .object({
    placeholder: z.string().trim().max(300).optional(),
    helpText: z.string().trim().max(500).optional(),
  })
  .strict();

export const CollectionReferenceCardinalitySchema = z.enum(['one', 'many']);
export type CollectionReferenceCardinality = z.infer<
  typeof CollectionReferenceCardinalitySchema
>;

const collectionFieldDefinitionInputShape = {
  key,
  label: nonEmpty.max(200),
  type: CollectionFieldTypeSchema,
  required: z.boolean(),
  description: z.string().trim().max(500).optional(),
  defaultValue: z.unknown().optional(),
  validation: CollectionFieldValidationSchema.optional(),
  ui: CollectionFieldUiSchema.optional(),
  indexed: z.boolean().default(false),
  unique: z.boolean().default(false),
  status: CollectionFieldStatusSchema.default('active'),
  options: z.array(CollectionFieldOptionSchema).max(200).optional(),
  targetCollectionId: entityId.optional(),
  cardinality: CollectionReferenceCardinalitySchema.optional(),
  slugFromFieldKey: key.optional(),
  manualSlugOverride: z.boolean().default(true),
};

const validateCollectionFieldDefinition = (
  field: z.infer<z.ZodObject<typeof collectionFieldDefinitionInputShape>>,
  context: z.RefinementCtx,
) => {
  if (field.type === 'reference' && (!field.targetCollectionId || !field.cardinality)) {
    context.addIssue({
      code: 'custom',
      path: ['targetCollectionId'],
      message: 'Reference fields require a target collection and cardinality',
    });
  }
  if (field.type !== 'reference' && (field.targetCollectionId || field.cardinality)) {
    context.addIssue({
      code: 'custom',
      path: ['targetCollectionId'],
      message: 'Only reference fields can define a target collection',
    });
  }
  if (field.type !== 'slug' && field.slugFromFieldKey) {
    context.addIssue({
      code: 'custom',
      path: ['slugFromFieldKey'],
      message: 'Only slug fields can define an automatic source field',
    });
  }
};

export const CollectionFieldDefinitionInputSchema = z
  .object(collectionFieldDefinitionInputShape)
  .strict()
  .superRefine(validateCollectionFieldDefinition);

export const CollectionFieldDefinitionSchema = z
  .object({ id: entityId, ...collectionFieldDefinitionInputShape })
  .strict()
  .superRefine(validateCollectionFieldDefinition);
export type CollectionFieldDefinition = z.infer<typeof CollectionFieldDefinitionSchema>;

export const CollectionSchemaVersionSchema = z.number().int().positive();

export const CollectionDefinitionSchema = z
  .object({
    id: entityId,
    workspaceId: entityId,
    siteId: entityId,
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9-]*$/),
    name: nonEmpty.max(200),
    singularName: nonEmpty.max(200),
    description: z.string().trim().max(1_000).optional(),
    fields: z.array(CollectionFieldDefinitionSchema).max(100),
    titleFieldKey: key.optional(),
    status: z.enum(['active', 'archived']),
    schemaVersion: CollectionSchemaVersionSchema.default(1),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .superRefine((collection, context) => {
    const keys = new Set<string>();
    const ids = new Set<string>();
    collection.fields.forEach((field, index) => {
      if (keys.has(field.key))
        context.addIssue({
          code: 'custom',
          path: ['fields', index, 'key'],
          message: 'Field keys must be unique',
        });
      if (ids.has(field.id))
        context.addIssue({
          code: 'custom',
          path: ['fields', index, 'id'],
          message: 'Field ids must be unique',
        });
      keys.add(field.key);
      ids.add(field.id);
    });
    if (collection.titleFieldKey && !keys.has(collection.titleFieldKey)) {
      context.addIssue({
        code: 'custom',
        path: ['titleFieldKey'],
        message: 'titleFieldKey must reference a field in the collection',
      });
    }
  });
export type CollectionDefinition = z.infer<typeof CollectionDefinitionSchema>;

// Short aliases keep the public contract discoverable for extensions that use
// the generic names from the collection/runtime design docs.
export const CollectionSchema = CollectionDefinitionSchema;
export type Collection = CollectionDefinition;
export const CollectionFieldSchema = CollectionFieldDefinitionSchema;
export type CollectionField = CollectionFieldDefinition;

export const CreateCollectionRequestSchema = z
  .object({
    key: CollectionDefinitionSchema.shape.key,
    name: CollectionDefinitionSchema.shape.name,
    singularName: CollectionDefinitionSchema.shape.singularName,
    description: CollectionDefinitionSchema.shape.description,
    fields: z.array(CollectionFieldDefinitionInputSchema).max(100).default([]),
    titleFieldKey: key.optional(),
  })
  .strict();
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

export const UpdateCollectionRequestSchema = z
  .object({
    name: CollectionDefinitionSchema.shape.name.optional(),
    singularName: CollectionDefinitionSchema.shape.singularName.optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    fields: z.array(CollectionFieldDefinitionSchema).max(100).optional(),
    titleFieldKey: key.nullable().optional(),
    expectedSchemaVersion: CollectionSchemaVersionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequestSchema>;

export const CollectionEntryStatusSchema = z.enum(['draft', 'published', 'archived']);
export type CollectionEntryStatus = z.infer<typeof CollectionEntryStatusSchema>;

export const CollectionEntrySchema = z
  .object({
    id: entityId,
    workspaceId: entityId,
    siteId: entityId,
    collectionId: entityId,
    draftVersionId: entityId.optional(),
    publishedVersionId: entityId.optional(),
    status: CollectionEntryStatusSchema,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
export type CollectionEntry = z.infer<typeof CollectionEntrySchema>;

export const CollectionEntryVersionSchema = z
  .object({
    id: entityId,
    entryId: entityId,
    collectionId: entityId,
    versionNumber: z.number().int().positive(),
    values: z.record(z.string().trim().min(1).max(100), z.unknown()),
    createdAt: timestamp,
    createdBy: z.string().trim().min(1).max(320).optional(),
  })
  .strict();
export type CollectionEntryVersion = z.infer<typeof CollectionEntryVersionSchema>;

export const CollectionEntryResponseSchema = CollectionEntrySchema.extend({
  values: z.record(z.string().trim().min(1).max(100), z.unknown()),
  versionNumber: z.number().int().positive(),
}).strict();
export type CollectionEntryResponse = z.infer<typeof CollectionEntryResponseSchema>;

export const CreateCollectionEntryRequestSchema = z
  .object({ values: z.record(z.string().trim().min(1).max(100), z.unknown()) })
  .strict();
export const UpdateCollectionEntryRequestSchema =
  CreateCollectionEntryRequestSchema.extend({
    expectedVersionNumber: z.number().int().positive().optional(),
  });
export type CreateCollectionEntryRequest = z.infer<
  typeof CreateCollectionEntryRequestSchema
>;
export type UpdateCollectionEntryRequest = z.infer<
  typeof UpdateCollectionEntryRequestSchema
>;

export const CollectionEntryListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().nonnegative().default(0),
    search: z.string().trim().max(200).optional(),
    status: CollectionEntryStatusSchema.optional(),
    sortField: key.optional(),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
export type CollectionEntryListQuery = z.infer<typeof CollectionEntryListQuerySchema>;

export const CollectionEntryListResponseSchema = z
  .object({
    items: z.array(CollectionEntryResponseSchema),
    pagination: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
        hasNextPage: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type CollectionEntryListResponse = z.infer<
  typeof CollectionEntryListResponseSchema
>;

export const DataSourceDescriptorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('collection'), collectionId: entityId }).strict(),
  z
    .object({ type: z.literal('current-entry'), collectionId: entityId.optional() })
    .strict(),
  z.object({ type: z.literal('static') }).strict(),
  z
    .object({ type: z.literal('extension'), sourceId: z.string().trim().min(1).max(120) })
    .strict(),
]);
export type DataSourceDescriptor = z.infer<typeof DataSourceDescriptorSchema>;

export const QueryFilterOperatorSchema = z.enum([
  'equals',
  'notEquals',
  'contains',
  'startsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'exists',
]);
export type QueryFilterOperator = z.infer<typeof QueryFilterOperatorSchema>;

const queryValue = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.union([z.string().max(2_000), z.number().finite(), z.boolean()])).max(100),
]);

export const PageQueryFilterSchema = z
  .object({
    field: key,
    operator: QueryFilterOperatorSchema,
    value: queryValue.optional(),
  })
  .strict();
export type PageQueryFilter = z.infer<typeof PageQueryFilterSchema>;
export const QueryFilterSchema = PageQueryFilterSchema;
export type QueryFilter = PageQueryFilter;

export const PageQuerySortSchema = z
  .object({ field: key, direction: z.enum(['asc', 'desc']) })
  .strict();
export type PageQuerySort = z.infer<typeof PageQuerySortSchema>;

export const PageQuerySchema = z
  .object({
    id: entityId,
    source: DataSourceDescriptorSchema,
    filters: z.array(PageQueryFilterSchema).max(20).default([]),
    sort: z.array(PageQuerySortSchema).max(5).default([]),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().nonnegative().max(100_000).default(0),
  })
  .strict();
export type PageQuery = z.infer<typeof PageQuerySchema>;
export const QuerySchema = PageQuerySchema;
export type Query = PageQuery;
export const DataSourceSchema = DataSourceDescriptorSchema;
export type DataSource = DataSourceDescriptor;

export const CollectionQueryRequestSchema = z
  .object({
    filters: z.array(PageQueryFilterSchema).max(20).default([]),
    sort: z.array(PageQuerySortSchema).max(5).default([]),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().nonnegative().max(100_000).default(0),
  })
  .strict();
export type CollectionQueryRequest = z.infer<typeof CollectionQueryRequestSchema>;

export const CollectionQueryResponseSchema = CollectionEntryListResponseSchema;
export type CollectionQueryResponse = CollectionEntryListResponse;

export const DynamicPathPatternSchema = z
  .string()
  .trim()
  .min(3)
  .max(300)
  .regex(/^\/[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9][a-z0-9._~-]*)*\/\{[a-z][a-z0-9_]*\}$/);
export type DynamicPathPattern = z.infer<typeof DynamicPathPatternSchema>;

export function dynamicPathBase(pathPattern: string): string {
  const normalized = DynamicPathPatternSchema.parse(pathPattern);
  return normalized.slice(0, normalized.lastIndexOf('/{')) || '/';
}

export function dynamicPathParameter(pathPattern: string): string {
  const normalized = DynamicPathPatternSchema.parse(pathPattern);
  return normalized.slice(normalized.lastIndexOf('/{') + 2, -1);
}

export function matchDynamicPath(
  pathPattern: string,
  path: string,
): Record<string, string> | null {
  const pattern = DynamicPathPatternSchema.safeParse(pathPattern);
  if (!pattern.success) return null;
  const parameter = dynamicPathParameter(pattern.data);
  const base = dynamicPathBase(pattern.data);
  const normalizedPath = path.replace(/\/+$/, '') || '/';
  const prefix = base === '/' ? '/' : `${base}/`;
  if (!normalizedPath.startsWith(prefix)) return null;
  const value = normalizedPath.slice(prefix.length);
  if (!value || value.includes('/')) return null;
  return { [parameter]: decodeURIComponent(value) };
}

export const DynamicPageMetadataSchema = z
  .object({
    collectionId: entityId,
    pathPattern: DynamicPathPatternSchema,
    lookupField: key,
  })
  .strict();
export type DynamicPageMetadata = z.infer<typeof DynamicPageMetadataSchema>;

export const ResolvedDataRecordSchema = z
  .object({
    id: entityId,
    collectionId: entityId,
    values: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ResolvedDataRecord = z.infer<typeof ResolvedDataRecordSchema>;

export const ResolvedDataContextSchema = z
  .object({
    currentEntry: ResolvedDataRecordSchema.optional(),
    queryItems: z
      .record(z.string().uuid(), z.array(ResolvedDataRecordSchema).max(100))
      .default({}),
    variables: z.record(z.string().trim().min(1).max(200), z.unknown()).default({}),
  })
  .strict();
export type ResolvedDataContext = z.infer<typeof ResolvedDataContextSchema>;

export const CollectionUsageResponseSchema = z
  .object({
    collectionId: entityId,
    references: z.array(
      z
        .object({ type: z.string().min(1), id: entityId, label: z.string().min(1) })
        .strict(),
    ),
  })
  .strict();
export type CollectionUsageResponse = z.infer<typeof CollectionUsageResponseSchema>;
