import { z } from 'zod';
import {
  CustomExtensionDefinitionSchema,
  ExtensionContributionSchema,
} from './page-extensions';
import {
  ExtensionContributionListSchema,
  type ExtensionContributionList,
  type ExtensionContributionEntry,
} from './extension-platform';

const extensionId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

const semver = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

export const EXTENSION_API_VERSION = '1' as const;

export const ExtensionIds = {
  DemoAnalytics: 'demo-analytics',
  DemoBuilder: 'demo-builder-countdown',
  DemoWebhook: 'demo-webhook',
} as const;

export const ExtensionCapabilities = {
  BuilderElement: 'builder.element',
  BuilderCountdown: 'builder.element.countdown',
  IntegrationWebhook: 'integration.webhook',
  AnalyticsEvents: 'analytics.events',
  PageInstances: 'page.instances',
  PageHooks: 'page.hooks',
  RendererRuntime: 'renderer.runtime',
  DataBindings: 'data.bindings',
  FormProcessors: 'forms.processors',
  PublishingHooks: 'publishing.hooks',
} as const;

export const ExtensionPermissionKeys = {
  Read: 'extensions.read',
  Manage: 'extensions.manage',
} as const;

export const ExtensionLifecycleSchema = z.enum([
  'registered',
  'validated',
  'enabled',
  'initialized',
  'active',
  'disabled',
  'error',
]);
export type ExtensionLifecycle = z.infer<typeof ExtensionLifecycleSchema>;

export const ExtensionHealthSchema = z.enum([
  'healthy',
  'misconfigured',
  'unavailable',
  'error',
  'disabled',
]);
export type ExtensionHealth = z.infer<typeof ExtensionHealthSchema>;

export const ExtensionDependencySchema = z
  .object({ extensionId, version: z.string().trim().min(1).max(50) })
  .strict();
export type ExtensionDependency = z.infer<typeof ExtensionDependencySchema>;

export const ExtensionConfigurationFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-zA-Z0-9_]*$/),
    label: z.string().trim().min(1).max(200),
    type: z.enum(['text', 'url', 'secret', 'boolean', 'number']),
    required: z.boolean().default(false),
    description: z.string().trim().max(500).optional(),
  })
  .strict();
export type ExtensionConfigurationField = z.infer<
  typeof ExtensionConfigurationFieldSchema
>;

export const ExtensionConfigurationDefinitionSchema = z
  .object({ fields: z.array(ExtensionConfigurationFieldSchema).max(50) })
  .strict();
export type ExtensionConfigurationDefinition = z.infer<
  typeof ExtensionConfigurationDefinitionSchema
>;

export const ExtensionManifestSchema = z
  .object({
    id: extensionId,
    name: z.string().trim().min(1).max(200),
    version: semver,
    apiVersion: z.literal(EXTENSION_API_VERSION),
    description: z.string().trim().max(500).optional(),
    capabilities: z.array(z.string().trim().min(1).max(150)).max(50).default([]),
    dependencies: z.array(ExtensionDependencySchema).max(20).default([]),
    permissions: z.array(z.string().trim().min(1).max(150)).max(50).default([]),
    configuration: ExtensionConfigurationDefinitionSchema.optional(),
    pageConfiguration: ExtensionConfigurationDefinitionSchema.optional(),
    contributions: ExtensionContributionSchema.optional(),
  })
  .strict();
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

/**
 * The deploy-time package contract. Tenant records may configure or enable a
 * package, but they never contain this executable definition. The grouped
 * `manifest.contributions` field remains supported for existing extensions;
 * new packages should use this normalized, typed contribution list.
 */
export const ExtensionDefinitionSchema = z
  .object({
    manifest: ExtensionManifestSchema,
    contributions: ExtensionContributionListSchema.default([]),
  })
  .strict();
export type ExtensionDefinition = z.infer<typeof ExtensionDefinitionSchema>;

export type { ExtensionContributionEntry, ExtensionContributionList };

export const ExtensionConfigurationSchema = z.record(
  z.string().trim().min(1).max(100),
  z.union([z.string().max(4_000), z.boolean(), z.number().finite()]),
);
export type ExtensionConfiguration = z.infer<typeof ExtensionConfigurationSchema>;

export const ExtensionConfigRequestSchema = z
  .object({ configuration: ExtensionConfigurationSchema })
  .strict();
export type ExtensionConfigRequest = z.infer<typeof ExtensionConfigRequestSchema>;

export const ExtensionDescriptorSchema = z
  .object({
    manifest: ExtensionManifestSchema,
    lifecycle: ExtensionLifecycleSchema,
    tenantEnabled: z.boolean(),
    health: ExtensionHealthSchema,
    configuredFields: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    dependencies: z.array(ExtensionDependencySchema).default([]),
    contributionEntries: ExtensionContributionListSchema.default([]),
    custom: CustomExtensionDefinitionSchema.optional(),
    error: z.string().max(500).optional(),
  })
  .strict();
export type ExtensionDescriptor = z.infer<typeof ExtensionDescriptorSchema>;

export const ExtensionListResponseSchema = z
  .object({ items: z.array(ExtensionDescriptorSchema) })
  .strict();
export type ExtensionListResponse = z.infer<typeof ExtensionListResponseSchema>;

export const PlatformEventNameSchema = z.enum([
  'page.created',
  'page.updated',
  'page.published',
  'form.submitted',
  'lead.created',
  'user.created',
  'workspace.created',
  'domain.verified',
  'extension.enabled',
  'extension.disabled',
  'page.viewed',
  'button.clicked',
  'payment.completed',
  'payment.failed',
  'order.created',
  'order.completed',
  'booking.created',
  'cart.abandoned',
]);
export type PlatformEventName = z.infer<typeof PlatformEventNameSchema>;

export type PlatformEventBase = {
  tenantId: string;
  occurredAt: string;
  eventId?: string;
  correlationId?: string;
  causationId?: string;
  rootExecutionId?: string;
  requestId?: string;
};

export type PlatformEventMap = {
  'page.created': PlatformEventBase & {
    pageId: string;
    workspaceId: string;
    siteId: string;
  };
  'page.updated': PlatformEventBase & {
    pageId: string;
    workspaceId: string;
    versionNumber?: number;
  };
  'page.published': PlatformEventBase & {
    pageId: string;
    workspaceId: string;
    versionNumber: number;
  };
  'form.submitted': PlatformEventBase & {
    submissionId: string;
    workspaceId: string;
    siteId: string;
    pageId: string;
    formNodeId: string;
  };
  'lead.created': PlatformEventBase & {
    submissionId: string;
    workspaceId: string;
  };
  'user.created': PlatformEventBase & { userId: string };
  'workspace.created': PlatformEventBase & { workspaceId: string };
  'domain.verified': PlatformEventBase & { domainId: string; workspaceId: string };
  'extension.enabled': PlatformEventBase & { extensionId: string };
  'extension.disabled': PlatformEventBase & { extensionId: string };
  'page.viewed': PlatformEventBase & {
    workspaceId: string;
    siteId: string;
    pageId: string;
    pageVersionId?: string;
    sessionId?: string;
  };
  'button.clicked': PlatformEventBase & {
    workspaceId: string;
    siteId: string;
    pageId: string;
    pageVersionId?: string;
    nodeId: string;
    sessionId?: string;
  };
  'payment.completed': PlatformEventBase & {
    workspaceId: string;
    paymentId: string;
    orderId?: string;
    amount?: number;
    currency?: string;
  };
  'payment.failed': PlatformEventBase & {
    workspaceId: string;
    paymentId: string;
    reason?: string;
  };
  'order.created': PlatformEventBase & { workspaceId: string; orderId: string };
  'order.completed': PlatformEventBase & { workspaceId: string; orderId: string };
  'booking.created': PlatformEventBase & { workspaceId: string; bookingId: string };
  'cart.abandoned': PlatformEventBase & { workspaceId: string; cartId: string };
};
