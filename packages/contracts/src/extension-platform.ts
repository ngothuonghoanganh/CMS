import { z } from 'zod';

const contributionId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const contributionLabel = z.string().trim().min(1).max(160);
const capabilityId = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const permissionId = z
  .string()
  .trim()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

export const ExtensionContributionTypeSchema = z.enum([
  'builder.element',
  'builder.block',
  'builder.action',
  'builder.propertyEditor',
  'page.navigation',
  'cms.menu',
  'cms.route',
  'cms.page',
  'cms.panel',
  'cms.settings',
  'data.model',
  'data.collection',
  'data.connector',
  'data.source',
  'data.query',
  'data.variable',
  'action',
  'trigger',
  'condition',
  'form.processor',
  'mail.provider',
  'payment.provider',
  'sms.provider',
  'analytics.provider',
  'webhook.provider',
  'renderer.component',
  'runtime.module',
  'runtime.asset',
  'page.lifecycle',
  'server.action',
  'webhook.handler',
  'event.subscriber',
  'job.handler',
  'publish.validator',
  'publish.hook',
]);
export type ExtensionContributionType = z.infer<typeof ExtensionContributionTypeSchema>;

const contributionBase = {
  id: contributionId,
  label: contributionLabel,
  capability: capabilityId.optional(),
  permissions: z.array(permissionId).max(20).default([]),
} as const;

const genericContributionTypes = [
  'builder.propertyEditor',
  'page.navigation',
  'cms.route',
  'cms.page',
  'cms.panel',
  'cms.settings',
  'data.model',
  'data.collection',
  'data.connector',
  'data.query',
  'action',
  'trigger',
  'condition',
  'mail.provider',
  'payment.provider',
  'sms.provider',
  'analytics.provider',
  'webhook.provider',
  'runtime.module',
  'page.lifecycle',
  'webhook.handler',
  'event.subscriber',
  'job.handler',
  'publish.hook',
] as const;

const genericContribution = z.object({
  ...contributionBase,
  type: z.enum(genericContributionTypes),
});

export const ExtensionContributionEntrySchema = z.discriminatedUnion('type', [
  z.object({
    ...contributionBase,
    type: z.literal('builder.element'),
    nodeType: z.string().trim().min(1).max(100),
    propertyKeys: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    allowedParents: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('builder.block'),
    elementIds: z.array(contributionId).min(1).max(50),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('builder.action'),
    inputKeys: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('cms.menu'),
    path: z.string().trim().min(1).max(200),
    icon: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('data.source'),
    output: z.string().trim().min(1).max(120),
    queryKeys: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('data.variable'),
    path: z.string().trim().min(1).max(200),
    valueType: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('form.processor'),
    inputKeys: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('server.action'),
    inputKeys: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('renderer.component'),
    runtimeId: capabilityId,
    styleAssetIds: z.array(capabilityId).max(20).default([]),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('runtime.asset'),
    assetId: capabilityId,
    kind: z.enum(['script', 'style', 'font']),
  }),
  z.object({
    ...contributionBase,
    type: z.literal('publish.validator'),
    errorCode: z.string().trim().min(1).max(120),
  }),
  genericContribution,
]);
export type ExtensionContributionEntry = z.infer<typeof ExtensionContributionEntrySchema>;

export const ExtensionContributionListSchema = z
  .array(ExtensionContributionEntrySchema)
  .max(500);
export type ExtensionContributionList = z.infer<typeof ExtensionContributionListSchema>;

const safeConfigValue = z.union([
  z.string().max(4_000),
  z.boolean(),
  z.number().finite(),
]);

export const ExtensionInstallationStatusSchema = z.enum([
  'enabled',
  'disabled',
  'misconfigured',
]);
export type ExtensionInstallationStatus = z.infer<
  typeof ExtensionInstallationStatusSchema
>;

export const ExtensionInstallationSchema = z
  .object({
    extensionId: contributionId,
    enabled: z.boolean(),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    status: ExtensionInstallationStatusSchema,
    configuration: z.record(z.string().trim().min(1).max(100), safeConfigValue),
    connectionIds: z.array(z.string().uuid()).max(50),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ExtensionInstallation = z.infer<typeof ExtensionInstallationSchema>;

export const ExtensionConnectionStatusSchema = z.enum([
  'connected',
  'disconnected',
  'error',
  'disabled',
]);
export type ExtensionConnectionStatus = z.infer<typeof ExtensionConnectionStatusSchema>;

export const ExtensionConnectionSchema = z
  .object({
    id: z.string().uuid(),
    extensionId: contributionId,
    name: z.string().trim().min(1).max(200),
    status: ExtensionConnectionStatusSchema,
    configuration: z.record(z.string().trim().min(1).max(100), safeConfigValue),
    secretConfigured: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ExtensionConnection = z.infer<typeof ExtensionConnectionSchema>;

export const CreateExtensionConnectionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    configuration: z
      .record(z.string().trim().min(1).max(100), safeConfigValue)
      .default({}),
    secret: z.string().max(20_000).optional(),
  })
  .strict();
export type CreateExtensionConnectionRequest = z.infer<
  typeof CreateExtensionConnectionRequestSchema
>;

export const UpdateExtensionConnectionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    configuration: z
      .record(z.string().trim().min(1).max(100), safeConfigValue)
      .optional(),
    secret: z.string().max(20_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateExtensionConnectionRequest = z.infer<
  typeof UpdateExtensionConnectionRequestSchema
>;

export const ExtensionConnectionListResponseSchema = z
  .object({ items: z.array(ExtensionConnectionSchema) })
  .strict();
export type ExtensionConnectionListResponse = z.infer<
  typeof ExtensionConnectionListResponseSchema
>;

export const PageBindingSchema = z
  .object({
    id: z.string().uuid(),
    targetNodeId: z.string().trim().min(1).max(100),
    targetProperty: z.string().trim().min(1).max(120),
    source: z
      .object({
        type: z.enum(['static', 'variable', 'query']),
        path: z.string().trim().min(1).max(200),
      })
      .strict(),
  })
  .strict();
export type PageBinding = z.infer<typeof PageBindingSchema>;

export const PageActionSchema = z
  .object({
    id: z.string().uuid(),
    nodeId: z.string().trim().min(1).max(100),
    event: z.enum(['click', 'submit', 'load']),
    actionId: contributionId,
    input: z.record(z.string().trim().min(1).max(100), safeConfigValue),
  })
  .strict();
export type PageAction = z.infer<typeof PageActionSchema>;

export const PageResourceSchema = z
  .object({
    id: z.string().uuid(),
    extensionId: contributionId,
    resourceId: contributionId,
    connectionId: z.string().uuid().optional(),
    configuration: z.record(z.string().trim().min(1).max(100), safeConfigValue),
  })
  .strict();
export type PageResource = z.infer<typeof PageResourceSchema>;

export const PageExtensionAttachmentSchema = z
  .object({
    id: z.string().uuid(),
    pageId: z.string().uuid(),
    extensionId: contributionId,
    connectionId: z.string().uuid().optional(),
    enabled: z.boolean(),
    configuration: z.record(z.string().trim().min(1).max(100), safeConfigValue),
    resourceIds: z.array(z.string().uuid()).max(100),
  })
  .strict();
export type PageExtensionAttachment = z.infer<typeof PageExtensionAttachmentSchema>;
