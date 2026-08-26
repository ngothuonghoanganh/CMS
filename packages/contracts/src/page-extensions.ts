import { z } from 'zod';

const extensionKey = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

const contributionLabel = z.string().trim().min(1).max(120);
const propertyKey = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);

export const ExtensionSlotSchema = z.enum([
  'PAGE_HEAD',
  'PAGE_BODY_START',
  'PAGE_BODY_END',
  'BUILDER_LEFT_PANEL',
  'BUILDER_RIGHT_PANEL',
  'PAGE_SETTINGS',
  'FORM_PROCESSORS',
]);
export type ExtensionSlot = z.infer<typeof ExtensionSlotSchema>;

export const ExtensionHookSchema = z.enum([
  'page.loaded',
  'page.beforeRender',
  'page.rendered',
  'page.viewed',
  'page.exited',
  'page.beforePublish',
  'page.published',
  'page.unpublished',
  'form.submitted',
  'button.clicked',
]);
export type ExtensionHook = z.infer<typeof ExtensionHookSchema>;

const ContributionIdSchema = extensionKey;

const customExtensionId = extensionKey.refine(
  (value) => value.startsWith('custom-'),
  'Custom extension IDs must start with custom-',
);
const customExtensionVersion = z.string().regex(/^\d+\.\d+\.\d+$/);
const customExtensionHref = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value === '' ||
      value.startsWith('/') ||
      value.startsWith('#') ||
      /^https?:\/\//i.test(value),
    'Only relative, hash or http(s) links are allowed',
  );

export const CustomExtensionRenderSchema = z
  .object({
    kind: z.literal('banner'),
    eyebrow: z.string().trim().max(80).default(''),
    heading: z.string().trim().min(1).max(160),
    body: z.string().trim().max(500).default(''),
    buttonLabel: z.string().trim().max(80).default(''),
    buttonHref: customExtensionHref.default(''),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#8cf0c5'),
  })
  .strict();
export type CustomExtensionRender = z.infer<typeof CustomExtensionRenderSchema>;

export const CustomExtensionDefinitionSchema = z
  .object({
    id: customExtensionId,
    name: z.string().trim().min(1).max(200),
    version: customExtensionVersion,
    description: z.string().trim().max(500).optional(),
    render: CustomExtensionRenderSchema,
  })
  .strict();
export type CustomExtensionDefinition = z.infer<typeof CustomExtensionDefinitionSchema>;

export const CreateCustomExtensionRequestSchema = z
  .object({
    id: customExtensionId,
    name: z.string().trim().min(1).max(200),
    version: customExtensionVersion.default('1.0.0'),
    description: z.string().trim().max(500).optional(),
    render: CustomExtensionRenderSchema,
  })
  .strict();
export type CreateCustomExtensionRequest = z.infer<
  typeof CreateCustomExtensionRequestSchema
>;

export const UpdateCustomExtensionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    version: customExtensionVersion.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    render: CustomExtensionRenderSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateCustomExtensionRequest = z.infer<
  typeof UpdateCustomExtensionRequestSchema
>;

const customExtensionValue = z.union([
  z.string().max(500),
  z.boolean(),
  z.number().finite(),
]);

export const CustomExtensionNodePropsSchema = z
  .object({
    extensionId: extensionKey,
    values: z.record(z.string().trim().min(1).max(80), customExtensionValue).default({}),
  })
  .strict();
export type CustomExtensionNodeProps = z.infer<typeof CustomExtensionNodePropsSchema>;

export const ExtensionBuilderElementContributionSchema = z
  .object({
    id: ContributionIdSchema,
    label: contributionLabel,
    nodeType: z.string().trim().min(1).max(100),
    capability: extensionKey,
    propertyKeys: z.array(propertyKey).max(50).default([]),
  })
  .strict();

export const ExtensionBuilderBlockContributionSchema = z
  .object({
    id: ContributionIdSchema,
    label: contributionLabel,
    elementIds: z.array(ContributionIdSchema).min(1).max(50),
  })
  .strict();

export const ExtensionActionContributionSchema = z
  .object({
    id: ContributionIdSchema,
    label: contributionLabel,
    capability: extensionKey,
  })
  .strict();

export const ExtensionDataBindingContributionSchema = z
  .object({
    id: ContributionIdSchema,
    label: contributionLabel,
    path: z.string().trim().min(1).max(200),
  })
  .strict();

export const ExtensionPageSettingContributionSchema = z
  .object({
    id: ContributionIdSchema,
    label: contributionLabel,
    fieldKeys: z.array(extensionKey).max(50).default([]),
  })
  .strict();

export const ExtensionRendererContributionSchema = z
  .object({
    runtimeIds: z.array(extensionKey).max(20).default([]),
    styleAssetIds: z.array(extensionKey).max(20).default([]),
    slots: z.array(ExtensionSlotSchema).max(10).default([]),
  })
  .strict();

export const ExtensionDataContributionSchema = z
  .object({
    sources: z.array(ContributionIdSchema).max(50).default([]),
    variables: z.array(ExtensionDataBindingContributionSchema).max(100).default([]),
    queries: z.array(ContributionIdSchema).max(50).default([]),
  })
  .strict();

export const ExtensionFormsContributionSchema = z
  .object({
    fields: z.array(ContributionIdSchema).max(50).default([]),
    validators: z.array(ContributionIdSchema).max(50).default([]),
    processors: z.array(ContributionIdSchema).max(50).default([]),
    destinations: z.array(ContributionIdSchema).max(50).default([]),
  })
  .strict();

export const ExtensionAutomationContributionSchema = z
  .object({
    triggers: z.array(ContributionIdSchema).max(50).default([]),
    conditions: z.array(ContributionIdSchema).max(50).default([]),
    actions: z.array(ContributionIdSchema).max(50).default([]),
  })
  .strict();

export const ExtensionAnalyticsContributionSchema = z
  .object({
    events: z.array(ContributionIdSchema).max(50).default([]),
    metrics: z.array(ContributionIdSchema).max(50).default([]),
    trackers: z.array(ContributionIdSchema).max(50).default([]),
  })
  .strict();

export const ExtensionPublishingContributionSchema = z
  .object({
    validations: z.array(ContributionIdSchema).max(50).default([]),
    beforePublish: z.boolean().default(false),
    afterPublish: z.boolean().default(false),
  })
  .strict();

export const ExtensionCmsContributionSchema = z
  .object({
    panels: z.array(ContributionIdSchema).max(50).default([]),
    dashboardWidgets: z.array(ContributionIdSchema).max(50).default([]),
    slots: z.array(ExtensionSlotSchema).max(10).default([]),
  })
  .strict();

export const ExtensionContributionSchema = z
  .object({
    builder: z
      .object({
        elements: z.array(ExtensionBuilderElementContributionSchema).max(100).default([]),
        blocks: z.array(ExtensionBuilderBlockContributionSchema).max(100).default([]),
        actions: z.array(ExtensionActionContributionSchema).max(100).default([]),
        dataBindings: z
          .array(ExtensionDataBindingContributionSchema)
          .max(100)
          .default([]),
      })
      .strict()
      .optional(),
    page: z
      .object({
        settings: z.array(ExtensionPageSettingContributionSchema).max(50).default([]),
        hooks: z.array(ExtensionHookSchema).max(50).default([]),
        slots: z.array(ExtensionSlotSchema).max(10).default([]),
      })
      .strict()
      .optional(),
    renderer: ExtensionRendererContributionSchema.optional(),
    forms: ExtensionFormsContributionSchema.optional(),
    automation: ExtensionAutomationContributionSchema.optional(),
    data: ExtensionDataContributionSchema.optional(),
    analytics: ExtensionAnalyticsContributionSchema.optional(),
    publishing: ExtensionPublishingContributionSchema.optional(),
    cms: ExtensionCmsContributionSchema.optional(),
  })
  .strict();
export type ExtensionContribution = z.infer<typeof ExtensionContributionSchema>;

const extensionConfigValue = z.union([
  z.string().max(4_000),
  z.boolean(),
  z.number().finite(),
]);

export const PageExtensionInstanceSchema = z
  .object({
    id: z.string().uuid(),
    pageId: z.string().uuid(),
    extensionId: extensionKey,
    connectionId: z.string().uuid().optional(),
    enabled: z.boolean(),
    configuration: z.record(z.string().trim().min(1).max(100), extensionConfigValue),
    capabilities: z.array(extensionKey).default([]),
    runtimeIds: z.array(extensionKey).default([]),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type PageExtensionInstance = z.infer<typeof PageExtensionInstanceSchema>;

export const PageExtensionListResponseSchema = z
  .object({ items: z.array(PageExtensionInstanceSchema) })
  .strict();
export type PageExtensionListResponse = z.infer<typeof PageExtensionListResponseSchema>;

export const PageExtensionMutationRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    connectionId: z.string().uuid().nullable().optional(),
    configuration: z
      .record(z.string().trim().min(1).max(100), extensionConfigValue)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type PageExtensionMutationRequest = z.infer<
  typeof PageExtensionMutationRequestSchema
>;

export const PageRuntimeExtensionSchema = z
  .object({
    extensionId: extensionKey,
    runtimeIds: z.array(extensionKey),
    styleAssetIds: z.array(extensionKey),
    slots: z.array(ExtensionSlotSchema),
    custom: CustomExtensionDefinitionSchema.optional(),
  })
  .strict();
export type PageRuntimeExtension = z.infer<typeof PageRuntimeExtensionSchema>;

export const PageCapabilityGraphSchema = z
  .object({
    pageId: z.string().uuid(),
    extensionIds: z.array(extensionKey),
    capabilities: z.array(extensionKey),
    runtimeIds: z.array(extensionKey),
    dataBindings: z.array(extensionKey),
    slots: z.array(ExtensionSlotSchema),
  })
  .strict();
export type PageCapabilityGraph = z.infer<typeof PageCapabilityGraphSchema>;
