import { z } from 'zod';
import {
  CustomExtensionNodePropsSchema,
  PageRuntimeExtensionSchema,
  type CustomExtensionNodeProps,
} from './page-extensions';
import {
  PageActionSchema,
  PageBindingSchema,
  PageExtensionAttachmentSchema,
  PageResourceSchema,
} from './extension-platform';
import { PAGE_COMPONENT_REGISTRY, isPageComponentType } from './component-registry';
import { PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY } from './style-registry';

export const apiVersion = 'v1' as const;

export const BuilderDocumentKindSchema = z.enum(['page', 'site-header', 'site-footer']);
export type BuilderDocumentKind = z.infer<typeof BuilderDocumentKindSchema>;

export const EntityIdSchema = z.string().uuid();
export type EntityId = z.infer<typeof EntityIdSchema>;

const timestampSchema = z.string().datetime({ offset: true });
const nonEmptyText = z.string().trim().min(1);

export const AuthPrincipalSchema = z.object({
  subject: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  tenantId: EntityIdSchema.optional(),
  workspaceId: EntityIdSchema.optional(),
  organizationId: EntityIdSchema.optional(),
  organizationRole: z.enum(['owner', 'admin', 'member']).optional(),
  organizationStatus: z.enum(['active', 'suspended']).optional(),
});

export type AuthPrincipal = z.infer<typeof AuthPrincipalSchema>;

export const TenantPermissions = {
  ExtensionsRead: 'extensions.read',
  ExtensionsManage: 'extensions.manage',
  WorkspaceRead: 'workspace.read',
  WorkspaceCreate: 'workspace.create',
  WorkspaceUpdate: 'workspace.update',
  WorkspaceDelete: 'workspace.delete',
  MemberRead: 'member.read',
  MemberAdd: 'member.add',
  MemberUpdate: 'member.update',
  MemberRemove: 'member.remove',
  UserRead: 'user.read',
  UserCreate: 'user.create',
  UserUpdate: 'user.update',
  UserDisable: 'user.disable',
  UserRemove: 'user.remove',
  RoleRead: 'role.read',
  RoleCreate: 'role.create',
  RoleUpdate: 'role.update',
  RoleDelete: 'role.delete',
  RoleAssign: 'role.assign',
  PageRead: 'page.read',
  PageCreate: 'page.create',
  PageUpdate: 'page.update',
  PageDelete: 'page.delete',
  PagePublish: 'page.publish',
  PageRollback: 'page.rollback',
  LeadRead: 'lead.read',
  LeadUpdate: 'lead.update',
  AnalyticsRead: 'analytics.read',
  IntegrationRead: 'integration.read',
  IntegrationCreate: 'integration.create',
  IntegrationUpdate: 'integration.update',
  IntegrationDelete: 'integration.delete',
  IntegrationDeliveryRead: 'integration.delivery.read',
  IntegrationDeliveryRetry: 'integration.delivery.retry',
  DomainRead: 'domain.read',
  DomainCreate: 'domain.create',
  DomainUpdate: 'domain.update',
  DomainDelete: 'domain.delete',
  DomainVerify: 'domain.verify',
  SeoRead: 'seo.read',
  SeoUpdate: 'seo.update',
  BillingRead: 'billing.read',
  AuditRead: 'audit.read',
  SiteRead: 'site.read',
  SiteCreate: 'site.create',
  SiteUpdate: 'site.update',
  AssetRead: 'asset.read',
  AssetCreate: 'asset.create',
  AssetDelete: 'asset.delete',
  TemplateRead: 'template.read',
  TemplateCreate: 'template.create',
  TemplateUpdate: 'template.update',
  TemplateDelete: 'template.delete',
  FormIntegrationRead: 'form-integration.read',
  FormIntegrationUpdate: 'form-integration.update',
  WorkflowRead: 'workflow.read',
  WorkflowCreate: 'workflow.create',
  WorkflowUpdate: 'workflow.update',
  WorkflowPublish: 'workflow.publish',
  WorkflowEnable: 'workflow.enable',
  WorkflowDisable: 'workflow.disable',
  WorkflowExecutionRead: 'workflow.execution.read',
  WorkflowExecutionRetry: 'workflow.execution.retry',
} as const;

export const TenantPermissionSchema = z.enum(
  Object.values(TenantPermissions) as [string, ...string[]],
);
export type TenantPermission = z.infer<typeof TenantPermissionSchema>;

export * from './extensions';
export * from './extension-platform';
export * from './page-extensions';
export * from './workflows';

export const RoleTypeSchema = z.enum(['system', 'custom']);
export type RoleType = z.infer<typeof RoleTypeSchema>;
export const RoleScopeSchema = z.enum(['tenant', 'workspace']);
export type RoleScope = z.infer<typeof RoleScopeSchema>;

export const RoleSchema = z
  .object({
    id: EntityIdSchema,
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    type: RoleTypeSchema,
    permissions: z.array(TenantPermissionSchema).max(100),
    userCount: z.number().int().nonnegative().default(0),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Role = z.infer<typeof RoleSchema>;

export const RoleListResponseSchema = z.object({ items: z.array(RoleSchema) }).strict();
export type RoleListResponse = z.infer<typeof RoleListResponseSchema>;

export const RoleAssignmentSchema = z
  .object({
    id: EntityIdSchema,
    userId: z.string().trim().min(1).max(320),
    roleId: EntityIdSchema,
    roleKey: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    scope: RoleScopeSchema,
    workspaceId: EntityIdSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;

export const RoleAssignmentListResponseSchema = z
  .object({ items: z.array(RoleAssignmentSchema) })
  .strict();
export type RoleAssignmentListResponse = z.infer<typeof RoleAssignmentListResponseSchema>;

export const CreateRoleRequestSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    permissions: z.array(TenantPermissionSchema).max(100),
  })
  .strict();
export const UpdateRoleRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z.array(TenantPermissionSchema).max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const AssignRoleRequestSchema = z
  .object({
    userId: z.string().trim().min(1).max(320),
    roleId: EntityIdSchema,
    scope: RoleScopeSchema,
    workspaceId: EntityIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'workspace' && !value.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Workspace scope requires workspaceId',
      });
    }
    if (value.scope === 'tenant' && value.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Tenant scope cannot include workspaceId',
      });
    }
  });
export const AssignMemberRoleRequestSchema = z
  .object({
    roleId: EntityIdSchema,
    scope: RoleScopeSchema,
    workspaceId: EntityIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'workspace' && !value.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Workspace scope requires workspaceId',
      });
    }
    if (value.scope === 'tenant' && value.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Tenant scope cannot include workspaceId',
      });
    }
  });
export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequestSchema>;
export type AssignRoleRequest = z.infer<typeof AssignRoleRequestSchema>;

export const TenantUserStatusSchema = z.enum(['active', 'disabled']);
export type TenantUserStatus = z.infer<typeof TenantUserStatusSchema>;

export const TenantUserSchema = z
  .object({
    id: EntityIdSchema,
    email: z.string().email(),
    displayName: z.string().trim().max(200).optional(),
    status: TenantUserStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type TenantUser = z.infer<typeof TenantUserSchema>;

export const TenantUserListItemSchema = TenantUserSchema.extend({
  tenantRoleKeys: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  workspaceAccessCount: z.number().int().nonnegative(),
}).strict();
export type TenantUserListItem = z.infer<typeof TenantUserListItemSchema>;

export const TenantUserWorkspaceAccessSchema = z
  .object({
    workspaceId: EntityIdSchema,
    workspaceName: nonEmptyText.max(200),
    roleKeys: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    permissions: z.array(TenantPermissionSchema),
  })
  .strict();
export type TenantUserWorkspaceAccess = z.infer<typeof TenantUserWorkspaceAccessSchema>;

export const TenantUserDetailResponseSchema = z
  .object({
    user: TenantUserSchema,
    tenantRoles: z.array(RoleAssignmentSchema),
    workspaceAccess: z.array(TenantUserWorkspaceAccessSchema),
  })
  .strict();
export type TenantUserDetailResponse = z.infer<typeof TenantUserDetailResponseSchema>;

const tenantUserPaginationSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  })
  .strict();
const tenantUserPaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const TenantUserListResponseSchema = z
  .object({
    items: z.array(TenantUserListItemSchema),
    pagination: tenantUserPaginationSchema,
  })
  .strict();
export type TenantUserListResponse = z.infer<typeof TenantUserListResponseSchema>;

export const TenantUserListQuerySchema = tenantUserPaginationQuerySchema
  .extend({
    search: z.string().trim().max(200).optional(),
    status: TenantUserStatusSchema.optional(),
    roleId: EntityIdSchema.optional(),
    workspaceId: EntityIdSchema.optional(),
  })
  .strict();
export type TenantUserListQuery = z.infer<typeof TenantUserListQuerySchema>;

export const CreateTenantUserRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().max(200).optional(),
    password: z.string().min(8).max(200),
    roleId: EntityIdSchema.optional(),
    scope: RoleScopeSchema.optional(),
    workspaceId: EntityIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'workspace' && !value.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Workspace scope requires workspaceId',
      });
    }
    if (value.scope === 'tenant' && value.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'Tenant scope cannot include workspaceId',
      });
    }
    if (value.workspaceId && !value.roleId) {
      context.addIssue({
        code: 'custom',
        path: ['roleId'],
        message: 'workspaceId requires roleId',
      });
    }
  });
export type CreateTenantUserRequest = z.infer<typeof CreateTenantUserRequestSchema>;

export const UpdateTenantUserRequestSchema = z
  .object({ displayName: z.string().trim().max(200).nullable().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateTenantUserRequest = z.infer<typeof UpdateTenantUserRequestSchema>;
export type AssignMemberRoleRequest = z.infer<typeof AssignMemberRoleRequestSchema>;

export const EffectivePermissionsResponseSchema = z
  .object({
    userId: z.string().trim().min(1),
    tenantId: EntityIdSchema,
    workspaceId: EntityIdSchema,
    permissions: z.array(TenantPermissionSchema),
    assignments: z.array(RoleAssignmentSchema),
  })
  .strict();
export type EffectivePermissionsResponse = z.infer<
  typeof EffectivePermissionsResponseSchema
>;

export const PlatformPermissions = {
  TenantRead: 'platform.tenant.read',
  TenantCreate: 'platform.tenant.create',
  TenantUpdate: 'platform.tenant.update',
  PlanRead: 'platform.plan.read',
  PlanCreate: 'platform.plan.create',
  PlanUpdate: 'platform.plan.update',
  SubscriptionRead: 'platform.subscription.read',
  SubscriptionUpdate: 'platform.subscription.update',
  AuditRead: 'platform.audit.read',
} as const;
export const PlatformPermissionSchema = z.enum(
  Object.values(PlatformPermissions) as [string, ...string[]],
);
export type PlatformPermission = z.infer<typeof PlatformPermissionSchema>;
export const PlatformRoleSchema = z
  .object({
    id: EntityIdSchema,
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: nonEmptyText.max(200),
    permissions: z.array(PlatformPermissionSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;

export const AuditActorTypeSchema = z.enum(['user', 'system', 'platform_user']);
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;
export const AuditResultSchema = z.enum(['success', 'failure', 'denied']);
export type AuditResult = z.infer<typeof AuditResultSchema>;
export const AuditLogSchema = z
  .object({
    id: EntityIdSchema,
    actorType: AuditActorTypeSchema,
    actorId: z.string().trim().min(1),
    action: z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/),
    workspaceId: EntityIdSchema.optional(),
    resourceType: z.string().trim().min(1).max(100),
    resourceId: z.string().trim().min(1).max(200).optional(),
    result: AuditResultSchema,
    requestId: z.string().uuid().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    ipAddress: z.string().trim().max(100).optional(),
    userAgent: z.string().trim().max(500).optional(),
    createdAt: timestampSchema,
  })
  .strict();
export type AuditLog = z.infer<typeof AuditLogSchema>;
const auditPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const auditPaginationSchema = z.object({
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
});
export const AuditLogQuerySchema = auditPaginationQuerySchema
  .extend({
    workspaceId: EntityIdSchema.optional(),
    actorId: z.string().trim().min(1).max(320).optional(),
    action: z
      .string()
      .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/)
      .optional(),
    resourceType: z.string().trim().min(1).max(100).optional(),
    resourceId: z.string().trim().min(1).max(200).optional(),
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
  })
  .strict();
export const AuditLogListResponseSchema = z
  .object({ items: z.array(AuditLogSchema), pagination: auditPaginationSchema })
  .strict();
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type AuditLogListResponse = z.infer<typeof AuditLogListResponseSchema>;

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().uuid().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ErrorResponseSchema = z.object({
  error: ApiErrorSchema,
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const HealthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.enum(['ok', 'degraded']),
  timestamp: z.string().datetime(),
  version: z.literal(apiVersion),
  requestId: z.string().uuid().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(200),
    tenantSlug: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PAGE_PAYLOAD_MAX_SERIALIZED_BYTES = 256 * 1024;
export const PAGE_PAYLOAD_MAX_NODES = 200;
export const PAGE_PAYLOAD_MAX_TREE_DEPTH = 24;
export const PAGE_PAYLOAD_MAX_TEXT_LENGTH = 10_000;
export const PAGE_PAYLOAD_MAX_URL_LENGTH = 2_048;
export const PAGE_PAYLOAD_MAX_STYLE_VALUE_LENGTH = 512;
export const PAGE_PAYLOAD_MAX_NODE_ID_LENGTH = 128;
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export const MAX_HOSTNAME_LENGTH = 253;
export const MAX_PAGE_PATH_LENGTH = 512;
export const MAX_SEO_TITLE_LENGTH = 200;
export const MAX_SEO_DESCRIPTION_LENGTH = 500;
export const MAX_SEO_URL_LENGTH = 2_048;

export const OrganizationSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function normalizeOrganizationSlug(input: string): string {
  return normalizeUrlSlug(input, 80);
}

/**
 * Converts user-facing URL input into one deterministic, platform-safe slug.
 * This is intentionally shared by site/page management boundaries so the CMS
 * never needs to teach users about the legacy `slug` and canonical `path`
 * distinction.
 */
export function normalizeUrlSlug(input: string, maxLength = 80): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

export const RESERVED_PUBLIC_ROUTE_SEGMENTS = [
  'api',
  'admin',
  'cms',
  'auth',
  'login',
  'logout',
  'preview',
  'assets',
  'static',
  'health',
] as const;

const reservedPagePaths = new Set([
  ...RESERVED_PUBLIC_ROUTE_SEGMENTS.map((segment) => `/${segment}`),
  '/login',
  '/robots.txt',
  '/sitemap.xml',
]);
const pagePathPattern = /^\/(?:[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9][a-z0-9._~-]*)*)?$/;

/** Canonical public route identity. The root path is the only homepage path. */
export const PagePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PAGE_PATH_LENGTH)
  .regex(pagePathPattern, 'Path must contain lowercase URL-safe segments')
  .refine((value) => !reservedPagePaths.has(value), 'This path is reserved')
  .refine(
    (value) =>
      !RESERVED_PUBLIC_ROUTE_SEGMENTS.some((segment) => segment === value.split('/')[1]),
    'This path uses a reserved route segment',
  );
export type PagePath = z.infer<typeof PagePathSchema>;

export function normalizePagePath(input: string): string | null {
  const value = input.trim();
  if (!value || value.includes('?') || value.includes('#') || value.includes('\\')) {
    return null;
  }

  const path = `/${value.replace(/^\/+/, '')}`.replaceAll(/\/+/g, '/');
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const result = PagePathSchema.safeParse(normalized.toLowerCase());
  return result.success ? result.data : null;
}
const styleValue = z.string().trim().min(1).max(PAGE_PAYLOAD_MAX_STYLE_VALUE_LENGTH);
const pageNodeId = z
  .string()
  .regex(new RegExp(`^[A-Za-z][A-Za-z0-9_-]{0,${PAGE_PAYLOAD_MAX_NODE_ID_LENGTH - 1}}$`));

function isRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

/**
 * Normalizes the hostname representation used by public domain ownership and
 * routing. This intentionally accepts DNS hostnames only; protocol, path,
 * port, IP literals and internal-host policy are enforced by the API boundary.
 */
export function normalizeHostname(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/\.$/, '');
  if (
    value.length === 0 ||
    value.length > MAX_HOSTNAME_LENGTH ||
    value.includes('://') ||
    /[/?#\s:]/.test(value) ||
    !/^[a-z0-9.-]+$/.test(value) ||
    value.startsWith('.') ||
    value.endsWith('.') ||
    value.includes('..')
  ) {
    return null;
  }

  const labels = value.split('.');
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return null;
  }

  return value;
}

function isSafeMetadataUrl(value: string): boolean {
  if (isRelativePath(value)) {
    return true;
  }

  return isSafeAbsoluteUrl(value, ['http:', 'https:']);
}

function isAnchor(value: string): boolean {
  return /^#[A-Za-z][A-Za-z0-9:_-]{0,127}$/.test(value);
}

function isSafeAbsoluteUrl(value: string, protocols: readonly string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isSafeButtonHref(value: string): boolean {
  if (isRelativePath(value) || isAnchor(value)) {
    return true;
  }

  if (isSafeAbsoluteUrl(value, ['http:', 'https:'])) {
    return true;
  }

  return (
    /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value) ||
    /^tel:\+?[0-9(). -]{3,}$/i.test(value)
  );
}

function isSafeImageSource(value: string): boolean {
  return (
    (isRelativePath(value) && value.startsWith('/assets/')) ||
    isSafeAbsoluteUrl(value, ['http:', 'https:'])
  );
}

export function isSafePageHref(value: string): boolean {
  return isSafeButtonHref(value);
}

export function isSafePageImageSource(value: string): boolean {
  return isSafeImageSource(value);
}

export function isSafePageVideoSource(value: string): boolean {
  return isSafeImageSource(value);
}

const safeButtonHref = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_PAYLOAD_MAX_URL_LENGTH)
  .refine(isSafeButtonHref, 'URL protocol or format is not allowed');

const safeImageSource = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_PAYLOAD_MAX_URL_LENGTH)
  .refine(isSafeImageSource, 'Image source must be http(s) or an /assets/ path');

const safeVideoSource = z
  .string()
  .trim()
  .min(1)
  .max(PAGE_PAYLOAD_MAX_URL_LENGTH)
  .refine(isSafePageVideoSource, 'Video source must be http(s) or an /assets/ path');

const StyleBlockSchema = z
  .object({
    display: z
      .enum(['block', 'flex', 'grid', 'inline', 'inline-block', 'none'])
      .optional(),
    flexDirection: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).optional(),
    justifyContent: z
      .enum([
        'flex-start',
        'center',
        'flex-end',
        'space-between',
        'space-around',
        'space-evenly',
      ])
      .optional(),
    alignItems: z
      .enum(['flex-start', 'center', 'flex-end', 'stretch', 'baseline'])
      .optional(),
    flexWrap: z.enum(['nowrap', 'wrap', 'wrap-reverse']).optional(),
    gridTemplateColumns: styleValue.optional(),
    position: z.enum(['static', 'relative', 'sticky', 'absolute']).optional(),
    width: styleValue.optional(),
    height: styleValue.optional(),
    minWidth: styleValue.optional(),
    maxWidth: styleValue.optional(),
    minHeight: styleValue.optional(),
    maxHeight: styleValue.optional(),
    padding: styleValue.optional(),
    margin: styleValue.optional(),
    gap: styleValue.optional(),
    fontFamily: styleValue.optional(),
    backgroundColor: styleValue.optional(),
    color: styleValue.optional(),
    fontSize: styleValue.optional(),
    fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
    lineHeight: styleValue.optional(),
    letterSpacing: styleValue.optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    textDecoration: z.enum(['none', 'underline', 'line-through']).optional(),
    borderWidth: styleValue.optional(),
    borderStyle: z.enum(['none', 'solid', 'dashed', 'dotted']).optional(),
    borderColor: styleValue.optional(),
    borderRadius: styleValue.optional(),
    opacity: styleValue.optional(),
    boxShadow: styleValue.optional(),
  })
  .strict();

export const PageNodeStyleSchema = z
  .object({
    base: StyleBlockSchema,
    tablet: StyleBlockSchema.optional(),
    mobile: StyleBlockSchema.optional(),
  })
  .strict();

export type PageNodeStyle = z.infer<typeof PageNodeStyleSchema>;

type PageNodeBase = {
  id: string;
  style?: PageNodeStyle | undefined;
  children: PageNode[];
};

export type RootNode = PageNodeBase & {
  type: 'root';
  props: {};
};

export type SectionNode = PageNodeBase & {
  type: 'section';
  props: {};
};

export type ContainerNode = PageNodeBase & {
  type: 'container';
  props: {};
};

export type TextNode = PageNodeBase & {
  type: 'text';
  props: {
    text: string;
    align?: 'left' | 'center' | 'right' | undefined;
  };
};

export type ImageNode = PageNodeBase & {
  type: 'image';
  props: {
    src: string;
    alt: string;
  };
};

export type ButtonNode = PageNodeBase & {
  type: 'button';
  props: {
    label: string;
    href: string;
    target: '_self' | '_blank';
  };
};

export type PageNode =
  RootNode | SectionNode | ContainerNode | TextNode | ImageNode | ButtonNode;

const pageNodeChildren = () => z.array(PageNodeSchema);

export const PageNodeSchema: z.ZodType<PageNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        id: pageNodeId,
        type: z.literal('root'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('section'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('container'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('text'),
        props: z
          .object({
            text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
            align: z.enum(['left', 'center', 'right']).optional(),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('image'),
        props: z
          .object({
            src: safeImageSource,
            alt: z.string().trim().max(500),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('button'),
        props: z
          .object({
            label: nonEmptyText.max(200),
            href: safeButtonHref,
            target: z.enum(['_self', '_blank']),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeChildren(),
      })
      .strict(),
  ]),
);

export const PagePayloadV1Schema = z
  .object({
    version: z.literal(1),
    metadata: z
      .object({
        documentTitle: z.string().trim().min(1).max(200),
        documentDescription: z.string().trim().max(500).optional(),
      })
      .strict(),
    root: PageNodeSchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The payload root must have type root and id root',
        path: ['root'],
      });
    }

    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNode; path: (string | number)[]; depth: number }> = [
      { node: payload.root, path: ['root'], depth: 1 },
    ];
    let nodeCount = 0;
    let nodeLimitReported = false;
    let depthLimitReported = false;

    while (pending.length > 0) {
      const current = pending.pop();

      if (!current) {
        continue;
      }

      nodeCount += 1;
      if (nodeCount > PAGE_PAYLOAD_MAX_NODES) {
        if (!nodeLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_NODES}`,
            path: current.path,
          });
          nodeLimitReported = true;
        }
        continue;
      }

      if (current.depth > PAGE_PAYLOAD_MAX_TREE_DEPTH) {
        if (!depthLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_TREE_DEPTH}`,
            path: current.path,
          });
          depthLimitReported = true;
        }
        continue;
      }

      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);

      const allowedChildren = PAGE_COMPONENT_REGISTRY[current.node.type].allowedChildren;
      current.node.children.forEach((child, index) => {
        if (!allowedChildren.includes(child.type)) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children', index, 'type'],
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children', index],
          depth: current.depth + 1,
        });
      });
    }

    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > PAGE_PAYLOAD_MAX_SERIALIZED_BYTES) {
      context.addIssue({
        code: 'custom',
        message: `PAGE_PAYLOAD_TOO_LARGE: maximum serialized size is ${PAGE_PAYLOAD_MAX_SERIALIZED_BYTES} bytes`,
        path: [],
      });
    }
  });

export type PagePayloadV1 = z.infer<typeof PagePayloadV1Schema>;

// PagePayloadV1 is frozen. Forms need a first-class page node so that their
// position, schema and published-version semantics survive a builder round
// trip. The smallest compatible evolution is a parallel V2 node union; V1
// records are never rewritten or widened.
export const FORM_MAX_FIELDS = 20;
export const FORM_MAX_OPTIONS = 50;
export const FORM_MAX_FIELD_VALUE_LENGTH = 10_000;
export const FORM_MAX_SUBMISSION_FIELDS = FORM_MAX_FIELDS;

const formIdentifier = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'Must be a safe stable identifier')
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'Reserved identifiers are not allowed',
  );
const formLabel = nonEmptyText.max(200);
const formPlaceholder = z.string().trim().max(200).optional();
const formFieldBase = {
  id: formIdentifier,
  label: formLabel,
  name: formIdentifier,
  required: z.boolean(),
} as const;

const formTextField = z
  .object({ ...formFieldBase, type: z.literal('text'), placeholder: formPlaceholder })
  .strict();
const formEmailField = z
  .object({ ...formFieldBase, type: z.literal('email'), placeholder: formPlaceholder })
  .strict();
const formPhoneField = z
  .object({ ...formFieldBase, type: z.literal('phone'), placeholder: formPlaceholder })
  .strict();
const formTextareaField = z
  .object({ ...formFieldBase, type: z.literal('textarea'), placeholder: formPlaceholder })
  .strict();
const formCheckboxField = z
  .object({ ...formFieldBase, type: z.literal('checkbox') })
  .strict();
const formOptions = z
  .array(z.object({ value: formIdentifier, label: formLabel }).strict())
  .min(1)
  .max(FORM_MAX_OPTIONS)
  .superRefine((options, context) => {
    const values = new Set<string>();
    options.forEach((option, index) => {
      if (values.has(option.value)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate form option value: ${option.value}`,
          path: [index, 'value'],
        });
      }
      values.add(option.value);
    });
  });
const formSelectField = z
  .object({
    ...formFieldBase,
    type: z.literal('select'),
    placeholder: formPlaceholder,
    options: formOptions,
  })
  .strict();
const formRadioField = z
  .object({ ...formFieldBase, type: z.literal('radio'), options: formOptions })
  .strict();

export const FormFieldSchema = z.discriminatedUnion('type', [
  formTextField,
  formEmailField,
  formPhoneField,
  formTextareaField,
  formSelectField,
  formCheckboxField,
  formRadioField,
]);
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormPropsSchema = z
  .object({
    fields: z.array(FormFieldSchema).min(1).max(FORM_MAX_FIELDS),
    submitLabel: nonEmptyText.max(100),
    successMessage: nonEmptyText.max(500),
  })
  .strict()
  .superRefine((form, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    form.fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate form field id: ${field.id}`,
          path: ['fields', index, 'id'],
        });
      }
      if (names.has(field.name)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate form field name: ${field.name}`,
          path: ['fields', index, 'name'],
        });
      }
      ids.add(field.id);
      names.add(field.name);
    });
  });
export type FormProps = z.infer<typeof FormPropsSchema>;

type PageNodeV2Base = {
  id: string;
  style?: PageNodeStyle | undefined;
  children: PageNodeV2[];
};
export type RootNodeV2 = PageNodeV2Base & { type: 'root'; props: {} };
export type SectionNodeV2 = PageNodeV2Base & { type: 'section'; props: {} };
export type ContainerNodeV2 = PageNodeV2Base & { type: 'container'; props: {} };
export type TextNodeV2 = PageNodeV2Base & {
  type: 'text';
  props: { text: string; align?: 'left' | 'center' | 'right' | undefined };
};
export type ImageNodeV2 = PageNodeV2Base & {
  type: 'image';
  props: { src: string; alt: string };
};
export type ButtonNodeV2 = PageNodeV2Base & {
  type: 'button';
  props: { label: string; href: string; target: '_self' | '_blank' };
};
export type FormNode = PageNodeV2Base & { type: 'form'; props: FormProps };
export type PageNodeV2 =
  | RootNodeV2
  | SectionNodeV2
  | ContainerNodeV2
  | TextNodeV2
  | ImageNodeV2
  | ButtonNodeV2
  | FormNode;

const pageNodeV2Children = () => z.array(PageNodeV2Schema);
export const PageNodeV2Schema: z.ZodType<PageNodeV2> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        id: pageNodeId,
        type: z.literal('root'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV2Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('section'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV2Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('container'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV2Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('text'),
        props: z
          .object({
            text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
            align: z.enum(['left', 'center', 'right']).optional(),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV2Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('image'),
        props: z
          .object({ src: safeImageSource, alt: z.string().trim().max(500) })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV2Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('button'),
        props: z
          .object({
            label: nonEmptyText.max(200),
            href: safeButtonHref,
            target: z.enum(['_self', '_blank']),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV2Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('form'),
        props: FormPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: z.array(z.never()).length(0),
      })
      .strict(),
  ]),
);

export const PagePayloadV2Schema = z
  .object({
    version: z.literal(2),
    metadata: PagePayloadV1Schema.shape.metadata,
    root: PageNodeV2Schema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The payload root must have type root and id root',
        path: ['root'],
      });
    }
    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNodeV2; path: (string | number)[]; depth: number }> =
      [{ node: payload.root, path: ['root'], depth: 1 }];
    let nodeCount = 0;
    let nodeLimitReported = false;
    let depthLimitReported = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      nodeCount += 1;
      if (nodeCount > PAGE_PAYLOAD_MAX_NODES) {
        if (!nodeLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_NODES}`,
            path: current.path,
          });
          nodeLimitReported = true;
        }
        continue;
      }
      if (current.depth > PAGE_PAYLOAD_MAX_TREE_DEPTH) {
        if (!depthLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_TREE_DEPTH}`,
            path: current.path,
          });
          depthLimitReported = true;
        }
        continue;
      }
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);
      const allowedChildren = PAGE_COMPONENT_REGISTRY[current.node.type].allowedChildren;
      current.node.children.forEach((child, index) => {
        if (!allowedChildren.includes(child.type)) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children', index, 'type'],
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children', index],
          depth: current.depth + 1,
        });
      });
    }
    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > PAGE_PAYLOAD_MAX_SERIALIZED_BYTES) {
      context.addIssue({
        code: 'custom',
        message: `PAGE_PAYLOAD_TOO_LARGE: maximum serialized size is ${PAGE_PAYLOAD_MAX_SERIALIZED_BYTES} bytes`,
        path: [],
      });
    }
  });

export type PagePayloadV2 = z.infer<typeof PagePayloadV2Schema>;

// V3 is the first extension-capable payload discriminator. Existing V1/V2
// payloads remain untouched; the Countdown node is intentionally isolated in
// V3 so a tenant can opt into it without widening an older contract.
export const CountdownPropsSchema = z
  .object({
    targetAt: z.string().datetime({ offset: true }),
    label: nonEmptyText.max(200),
  })
  .strict();
export type CountdownProps = z.infer<typeof CountdownPropsSchema>;

type PageNodeV3Base = {
  id: string;
  style?: PageNodeStyle | undefined;
  children: PageNodeV3[];
};
export type RootNodeV3 = PageNodeV3Base & { type: 'root'; props: {} };
export type SectionNodeV3 = PageNodeV3Base & { type: 'section'; props: {} };
export type ContainerNodeV3 = PageNodeV3Base & { type: 'container'; props: {} };
export type TextNodeV3 = PageNodeV3Base & {
  type: 'text';
  props: { text: string; align?: 'left' | 'center' | 'right' | undefined };
};
export type ImageNodeV3 = PageNodeV3Base & {
  type: 'image';
  props: { src: string; alt: string };
};
export type ButtonNodeV3 = PageNodeV3Base & {
  type: 'button';
  props: { label: string; href: string; target: '_self' | '_blank' };
};
export type FormNodeV3 = PageNodeV3Base & { type: 'form'; props: FormProps };
export type CountdownNode = PageNodeV3Base & {
  type: 'countdown';
  props: CountdownProps;
};
export type ExtensionNode = PageNodeV3Base & {
  type: 'extension';
  props: CustomExtensionNodeProps;
};
export type PageNodeV3 =
  | RootNodeV3
  | SectionNodeV3
  | ContainerNodeV3
  | TextNodeV3
  | ImageNodeV3
  | ButtonNodeV3
  | FormNodeV3
  | CountdownNode
  | ExtensionNode;

const pageNodeV3Children = () => z.array(PageNodeV3Schema);
export const PageNodeV3Schema: z.ZodType<PageNodeV3> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        id: pageNodeId,
        type: z.literal('root'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV3Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('section'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV3Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('container'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV3Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('text'),
        props: z
          .object({
            text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
            align: z.enum(['left', 'center', 'right']).optional(),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV3Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('image'),
        props: z
          .object({ src: safeImageSource, alt: z.string().trim().max(500) })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV3Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('button'),
        props: z
          .object({
            label: nonEmptyText.max(200),
            href: safeButtonHref,
            target: z.enum(['_self', '_blank']),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV3Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('form'),
        props: FormPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: z.array(z.never()).length(0),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('countdown'),
        props: CountdownPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: z.array(z.never()).length(0),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('extension'),
        props: CustomExtensionNodePropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: z.array(z.never()).length(0),
      })
      .strict(),
  ]),
);

export const PagePayloadV3Schema = z
  .object({
    version: z.literal(3),
    metadata: PagePayloadV1Schema.shape.metadata,
    root: PageNodeV3Schema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The payload root must have type root and id root',
        path: ['root'],
      });
    }
    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNodeV3; path: (string | number)[]; depth: number }> =
      [{ node: payload.root, path: ['root'], depth: 1 }];
    let nodeCount = 0;
    let nodeLimitReported = false;
    let depthLimitReported = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      nodeCount += 1;
      if (nodeCount > PAGE_PAYLOAD_MAX_NODES) {
        if (!nodeLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_NODES}`,
            path: current.path,
          });
          nodeLimitReported = true;
        }
        continue;
      }
      if (current.depth > PAGE_PAYLOAD_MAX_TREE_DEPTH) {
        if (!depthLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_TREE_DEPTH}`,
            path: current.path,
          });
          depthLimitReported = true;
        }
        continue;
      }
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);
      const allowedChildren = PAGE_COMPONENT_REGISTRY[current.node.type].allowedChildren;
      current.node.children.forEach((child, index) => {
        if (!allowedChildren.includes(child.type)) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children', index, 'type'],
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children', index],
          depth: current.depth + 1,
        });
      });
    }
    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > PAGE_PAYLOAD_MAX_SERIALIZED_BYTES) {
      context.addIssue({
        code: 'custom',
        message: `PAGE_PAYLOAD_TOO_LARGE: maximum serialized size is ${PAGE_PAYLOAD_MAX_SERIALIZED_BYTES} bytes`,
        path: [],
      });
    }
  });

export type PagePayloadV3 = z.infer<typeof PagePayloadV3Schema>;

// V4 adds semantic core elements without changing the meaning of V1, V2 or
// V3. Legacy payloads remain valid immutable records; only documents that use
// one of these new node types need to serialize as V4.
export const HeadingPropsSchema = z
  .object({
    text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
  })
  .strict();
export type HeadingProps = z.infer<typeof HeadingPropsSchema>;

export const LinkPropsSchema = z
  .object({
    text: nonEmptyText.max(200),
    href: safeButtonHref,
    target: z.enum(['_self', '_blank']),
  })
  .strict();
export type LinkProps = z.infer<typeof LinkPropsSchema>;

export const ListItemSchema = z
  .object({
    id: pageNodeId,
    text: nonEmptyText.max(1_000),
  })
  .strict();
export type ListItem = z.infer<typeof ListItemSchema>;

export const ListPropsSchema = z
  .object({
    ordered: z.boolean(),
    items: z.array(ListItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((list, context) => {
    const ids = new Set<string>();
    list.items.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate list item id: ${item.id}`,
          path: ['items', index, 'id'],
        });
      }
      ids.add(item.id);
    });
  });
export type ListProps = z.infer<typeof ListPropsSchema>;

export const VideoPropsSchema = z
  .object({
    src: safeVideoSource,
    poster: safeImageSource.optional(),
    controls: z.boolean(),
    autoplay: z.boolean(),
    muted: z.boolean(),
    loop: z.boolean(),
    playsInline: z.boolean(),
  })
  .strict()
  .superRefine((video, context) => {
    if (video.autoplay && !video.muted) {
      context.addIssue({
        code: 'custom',
        message: 'Autoplay videos must be muted for browser compatibility',
        path: ['muted'],
      });
    }
  });
export type VideoProps = z.infer<typeof VideoPropsSchema>;

type PageNodeV4Base = {
  id: string;
  style?: PageNodeStyle | undefined;
  children: PageNodeV4[];
};
export type RootNodeV4 = PageNodeV4Base & { type: 'root'; props: {} };
export type SectionNodeV4 = PageNodeV4Base & { type: 'section'; props: {} };
export type ContainerNodeV4 = PageNodeV4Base & { type: 'container'; props: {} };
export type TextNodeV4 = PageNodeV4Base & {
  type: 'text';
  props: { text: string; align?: 'left' | 'center' | 'right' | undefined };
};
export type ImageNodeV4 = PageNodeV4Base & {
  type: 'image';
  props: { src: string; alt: string };
};
export type ButtonNodeV4 = PageNodeV4Base & {
  type: 'button';
  props: { label: string; href: string; target: '_self' | '_blank' };
};
export type FormNodeV4 = PageNodeV4Base & { type: 'form'; props: FormProps };
export type CountdownNodeV4 = PageNodeV4Base & {
  type: 'countdown';
  props: CountdownProps;
};
export type ExtensionNodeV4 = PageNodeV4Base & {
  type: 'extension';
  props: CustomExtensionNodeProps;
};
export type HeadingNode = PageNodeV4Base & { type: 'heading'; props: HeadingProps };
export type LinkNode = PageNodeV4Base & { type: 'link'; props: LinkProps };
export type DividerNode = PageNodeV4Base & { type: 'divider'; props: {} };
export type ListNode = PageNodeV4Base & { type: 'list'; props: ListProps };
export type VideoNode = PageNodeV4Base & { type: 'video'; props: VideoProps };
export type PageNodeV4 =
  | RootNodeV4
  | SectionNodeV4
  | ContainerNodeV4
  | TextNodeV4
  | ImageNodeV4
  | ButtonNodeV4
  | FormNodeV4
  | CountdownNodeV4
  | ExtensionNodeV4
  | HeadingNode
  | LinkNode
  | DividerNode
  | ListNode
  | VideoNode;

const pageNodeV4Children = () => z.array(PageNodeV4Schema);
const emptyPageChildren = () => z.array(z.never()).length(0);

export const PageNodeV4Schema: z.ZodType<PageNodeV4> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        id: pageNodeId,
        type: z.literal('root'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV4Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('section'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV4Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('container'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: pageNodeV4Children(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('text'),
        props: z
          .object({
            text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
            align: z.enum(['left', 'center', 'right']).optional(),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('image'),
        props: z
          .object({ src: safeImageSource, alt: z.string().trim().max(500) })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('button'),
        props: z
          .object({
            label: nonEmptyText.max(200),
            href: safeButtonHref,
            target: z.enum(['_self', '_blank']),
          })
          .strict(),
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('form'),
        props: FormPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('countdown'),
        props: CountdownPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('extension'),
        props: CustomExtensionNodePropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('heading'),
        props: HeadingPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('link'),
        props: LinkPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('divider'),
        props: z.object({}).strict(),
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('list'),
        props: ListPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
    z
      .object({
        id: pageNodeId,
        type: z.literal('video'),
        props: VideoPropsSchema,
        style: PageNodeStyleSchema.optional(),
        children: emptyPageChildren(),
      })
      .strict(),
  ]),
);

export const PagePayloadV4Schema = z
  .object({
    version: z.literal(4),
    metadata: PagePayloadV1Schema.shape.metadata,
    root: PageNodeV4Schema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The payload root must have type root and id root',
        path: ['root'],
      });
    }
    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNodeV4; path: (string | number)[]; depth: number }> =
      [{ node: payload.root, path: ['root'], depth: 1 }];
    let nodeCount = 0;
    let nodeLimitReported = false;
    let depthLimitReported = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      nodeCount += 1;
      if (nodeCount > PAGE_PAYLOAD_MAX_NODES) {
        if (!nodeLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_NODES}`,
            path: current.path,
          });
          nodeLimitReported = true;
        }
        continue;
      }
      if (current.depth > PAGE_PAYLOAD_MAX_TREE_DEPTH) {
        if (!depthLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_TREE_DEPTH}`,
            path: current.path,
          });
          depthLimitReported = true;
        }
        continue;
      }
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);
      const allowedChildren = PAGE_COMPONENT_REGISTRY[current.node.type].allowedChildren;
      current.node.children.forEach((child, index) => {
        if (!allowedChildren.includes(child.type)) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children', index, 'type'],
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children', index],
          depth: current.depth + 1,
        });
      });
    }
    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > PAGE_PAYLOAD_MAX_SERIALIZED_BYTES) {
      context.addIssue({
        code: 'custom',
        message: `PAGE_PAYLOAD_TOO_LARGE: maximum serialized size is ${PAGE_PAYLOAD_MAX_SERIALIZED_BYTES} bytes`,
        path: [],
      });
    }
  });

export type PagePayloadV4 = z.infer<typeof PagePayloadV4Schema>;

// V5 adds structural compound components while preserving the V4 tree shape:
// every persisted node still owns an ordered `children` array. Internal item
// nodes are real payload nodes, not editor-only implementation details.
export const QuotePropsSchema = z
  .object({
    text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
    cite: z.string().trim().max(500).optional(),
  })
  .strict();
export type QuoteProps = z.infer<typeof QuotePropsSchema>;

export const AccordionPropsSchema = z.object({ allowMultiple: z.boolean() }).strict();
export type AccordionProps = z.infer<typeof AccordionPropsSchema>;

export const AccordionItemPropsSchema = z
  .object({ title: nonEmptyText.max(300), defaultOpen: z.boolean() })
  .strict();
export type AccordionItemProps = z.infer<typeof AccordionItemPropsSchema>;

function validateAccordionOpenState(
  node: {
    type: string;
    props: unknown;
    children: Array<{ type: string; props: unknown }>;
  },
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  const props = node.props as { allowMultiple?: unknown };
  if (node.type !== 'accordion' || props.allowMultiple !== false) return;
  const openItems = node.children.filter(
    (child) =>
      child.type === 'accordion-item' &&
      (child.props as { defaultOpen?: unknown }).defaultOpen === true,
  );
  if (openItems.length > 1) {
    context.addIssue({
      code: 'custom',
      message: 'An accordion with allowMultiple=false may have only one open item',
      path: [...path, 'children'],
    });
  }
}

export const TabsPropsSchema = z
  .object({ orientation: z.enum(['horizontal', 'vertical']) })
  .strict();
export type TabsProps = z.infer<typeof TabsPropsSchema>;

export const TabItemPropsSchema = z.object({ label: nonEmptyText.max(300) }).strict();
export type TabItemProps = z.infer<typeof TabItemPropsSchema>;

export type PageNodeV5Base = {
  id: string;
  style?: PageNodeStyle | undefined;
  children: PageNodeV5[];
};
export type RootNodeV5 = PageNodeV5Base & { type: 'root'; props: {} };
export type SectionNodeV5 = PageNodeV5Base & { type: 'section'; props: {} };
export type ContainerNodeV5 = PageNodeV5Base & { type: 'container'; props: {} };
export type TextNodeV5 = PageNodeV5Base & {
  type: 'text';
  props: { text: string; align?: 'left' | 'center' | 'right' | undefined };
};
export type ImageNodeV5 = PageNodeV5Base & {
  type: 'image';
  props: { src: string; alt: string };
};
export type ButtonNodeV5 = PageNodeV5Base & {
  type: 'button';
  props: { label: string; href: string; target: '_self' | '_blank' };
};
export type FormNodeV5 = PageNodeV5Base & { type: 'form'; props: FormProps };
export type CountdownNodeV5 = PageNodeV5Base & {
  type: 'countdown';
  props: CountdownProps;
};
export type ExtensionNodeV5 = PageNodeV5Base & {
  type: 'extension';
  props: CustomExtensionNodeProps;
};
export type HeadingNodeV5 = PageNodeV5Base & { type: 'heading'; props: HeadingProps };
export type LinkNodeV5 = PageNodeV5Base & { type: 'link'; props: LinkProps };
export type DividerNodeV5 = PageNodeV5Base & { type: 'divider'; props: {} };
export type ListNodeV5 = PageNodeV5Base & { type: 'list'; props: ListProps };
export type VideoNodeV5 = PageNodeV5Base & { type: 'video'; props: VideoProps };
export type QuoteNodeV5 = PageNodeV5Base & { type: 'quote'; props: QuoteProps };
export type AccordionNodeV5 = PageNodeV5Base & {
  type: 'accordion';
  props: AccordionProps;
};
export type AccordionItemNodeV5 = PageNodeV5Base & {
  type: 'accordion-item';
  props: AccordionItemProps;
};
export type TabsNodeV5 = PageNodeV5Base & { type: 'tabs'; props: TabsProps };
export type TabItemNodeV5 = PageNodeV5Base & { type: 'tab-item'; props: TabItemProps };
export type GalleryNodeV5 = PageNodeV5Base & { type: 'gallery'; props: {} };
export type PageNodeV5 =
  | RootNodeV5
  | SectionNodeV5
  | ContainerNodeV5
  | TextNodeV5
  | ImageNodeV5
  | ButtonNodeV5
  | FormNodeV5
  | CountdownNodeV5
  | ExtensionNodeV5
  | HeadingNodeV5
  | LinkNodeV5
  | DividerNodeV5
  | ListNodeV5
  | VideoNodeV5
  | QuoteNodeV5
  | AccordionNodeV5
  | AccordionItemNodeV5
  | TabsNodeV5
  | TabItemNodeV5
  | GalleryNodeV5;

const pageNodeV5Children = () => z.array(PageNodeV5Schema);
const emptyPageV5Children = () => z.array(z.never()).length(0);
const pageNodeV5Base = <
  T extends z.ZodTypeAny,
  P extends z.ZodTypeAny,
  C extends z.ZodTypeAny,
>(
  type: T,
  props: P,
  children: C,
) =>
  z
    .object({
      id: pageNodeId,
      type,
      props,
      style: PageNodeStyleSchema.optional(),
      children,
    })
    .strict();

export const PageNodeV5Schema: z.ZodType<PageNodeV5> = z.lazy(() =>
  z.discriminatedUnion('type', [
    pageNodeV5Base(z.literal('root'), z.object({}).strict(), pageNodeV5Children()),
    pageNodeV5Base(z.literal('section'), z.object({}).strict(), pageNodeV5Children()),
    pageNodeV5Base(z.literal('container'), z.object({}).strict(), pageNodeV5Children()),
    pageNodeV5Base(
      z.literal('text'),
      z
        .object({
          text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
          align: z.enum(['left', 'center', 'right']).optional(),
        })
        .strict(),
      emptyPageV5Children(),
    ),
    pageNodeV5Base(
      z.literal('image'),
      z.object({ src: safeImageSource, alt: z.string().trim().max(500) }).strict(),
      emptyPageV5Children(),
    ),
    pageNodeV5Base(
      z.literal('button'),
      z
        .object({
          label: nonEmptyText.max(200),
          href: safeButtonHref,
          target: z.enum(['_self', '_blank']),
        })
        .strict(),
      emptyPageV5Children(),
    ),
    pageNodeV5Base(z.literal('form'), FormPropsSchema, emptyPageV5Children()),
    pageNodeV5Base(z.literal('countdown'), CountdownPropsSchema, emptyPageV5Children()),
    pageNodeV5Base(
      z.literal('extension'),
      CustomExtensionNodePropsSchema,
      emptyPageV5Children(),
    ),
    pageNodeV5Base(z.literal('heading'), HeadingPropsSchema, emptyPageV5Children()),
    pageNodeV5Base(z.literal('link'), LinkPropsSchema, emptyPageV5Children()),
    pageNodeV5Base(z.literal('divider'), z.object({}).strict(), emptyPageV5Children()),
    pageNodeV5Base(z.literal('list'), ListPropsSchema, emptyPageV5Children()),
    pageNodeV5Base(z.literal('video'), VideoPropsSchema, emptyPageV5Children()),
    pageNodeV5Base(z.literal('quote'), QuotePropsSchema, emptyPageV5Children()),
    pageNodeV5Base(z.literal('accordion'), AccordionPropsSchema, pageNodeV5Children()),
    pageNodeV5Base(
      z.literal('accordion-item'),
      AccordionItemPropsSchema,
      pageNodeV5Children(),
    ),
    pageNodeV5Base(z.literal('tabs'), TabsPropsSchema, pageNodeV5Children()),
    pageNodeV5Base(z.literal('tab-item'), TabItemPropsSchema, pageNodeV5Children()),
    pageNodeV5Base(z.literal('gallery'), z.object({}).strict(), pageNodeV5Children()),
  ]),
);

export const PagePayloadV5Schema = z
  .object({
    version: z.literal(5),
    metadata: PagePayloadV1Schema.shape.metadata,
    root: PageNodeV5Schema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The payload root must have type root and id root',
        path: ['root'],
      });
    }
    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNodeV5; path: (string | number)[]; depth: number }> =
      [{ node: payload.root, path: ['root'], depth: 1 }];
    let nodeCount = 0;
    let nodeLimitReported = false;
    let depthLimitReported = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      nodeCount += 1;
      if (nodeCount > PAGE_PAYLOAD_MAX_NODES) {
        if (!nodeLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_NODES}`,
            path: current.path,
          });
          nodeLimitReported = true;
        }
        continue;
      }
      if (current.depth > PAGE_PAYLOAD_MAX_TREE_DEPTH) {
        if (!depthLimitReported) {
          context.addIssue({
            code: 'custom',
            message: `PAGE_PAYLOAD_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_TREE_DEPTH}`,
            path: current.path,
          });
          depthLimitReported = true;
        }
        continue;
      }
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);

      const definition = PAGE_COMPONENT_REGISTRY[current.node.type];
      current.node.children.forEach((child, index) => {
        const slot = definition.slots.find((candidate) =>
          candidate.accepts.includes(child.type),
        );
        if (!slot) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children', index, 'type'],
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children', index],
          depth: current.depth + 1,
        });
      });

      for (const slot of definition.slots) {
        const count = current.node.children.filter((child) =>
          slot.accepts.includes(child.type),
        ).length;
        if (slot.minChildren !== undefined && count < slot.minChildren) {
          context.addIssue({
            code: 'custom',
            message: `${current.node.type} requires at least ${slot.minChildren} ${slot.label.toLowerCase()}`,
            path: [...current.path, 'children'],
          });
        }
        if (slot.maxChildren !== undefined && count > slot.maxChildren) {
          context.addIssue({
            code: 'custom',
            message: `${current.node.type} allows at most ${slot.maxChildren} ${slot.label.toLowerCase()}`,
            path: [...current.path, 'children'],
          });
        }
      }
      validateAccordionOpenState(current.node, context, current.path);
    }
    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > PAGE_PAYLOAD_MAX_SERIALIZED_BYTES) {
      context.addIssue({
        code: 'custom',
        message: `PAGE_PAYLOAD_TOO_LARGE: maximum serialized size is ${PAGE_PAYLOAD_MAX_SERIALIZED_BYTES} bytes`,
        path: [],
      });
    }
  });

export type PagePayloadV5 = z.infer<typeof PagePayloadV5Schema>;

// V6 adds authored accessibility settings and registry-controlled styles for
// semantic component parts. V5 remains immutable; a document only promotes to
// V6 when one of these persisted capabilities is actually present.
export const AccordionPropsV6Schema = AccordionPropsSchema.extend({
  headingLevel: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  ariaLabel: z.string().trim().max(200).optional(),
}).strict();
export type AccordionPropsV6 = z.infer<typeof AccordionPropsV6Schema>;

export const TabsPropsV6Schema = TabsPropsSchema.extend({
  ariaLabel: nonEmptyText.max(200),
  activationMode: z.enum(['manual', 'automatic']),
}).strict();
export type TabsPropsV6 = z.infer<typeof TabsPropsV6Schema>;

export const GlobalHeaderPropsSchema = z
  .object({ position: z.enum(['static', 'sticky']) })
  .strict();
export type GlobalHeaderProps = z.infer<typeof GlobalHeaderPropsSchema>;

export const GlobalFooterPropsSchema = z.object({}).strict();
export type GlobalFooterProps = z.infer<typeof GlobalFooterPropsSchema>;

export const NavigationViewPropsSchema = z
  .object({
    source: z.enum(['main', 'footer']),
    orientation: z.enum(['horizontal', 'vertical']),
    mobileBehavior: z.enum(['collapse', 'wrap', 'stack']),
    alignment: z.enum(['left', 'center', 'right']),
    ariaLabel: nonEmptyText.max(200),
  })
  .strict();
export type NavigationViewProps = z.infer<typeof NavigationViewPropsSchema>;

export const SiteBrandPropsSchema = z
  .object({
    display: z.enum(['logo', 'text', 'logo-text']),
    href: safeButtonHref,
  })
  .strict();
export type SiteBrandProps = z.infer<typeof SiteBrandPropsSchema>;

export type PageNodePartsStyle = Record<string, PageNodeStyle>;
export const PageNodePartsStyleSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  PageNodeStyleSchema,
);

type PageNodeV6Base = {
  id: string;
  style?: PageNodeStyle | undefined;
  partsStyle?: PageNodePartsStyle | undefined;
  children: PageNodeV6[];
};
export type RootNodeV6 = PageNodeV6Base & { type: 'root'; props: {} };
export type SectionNodeV6 = PageNodeV6Base & { type: 'section'; props: {} };
export type ContainerNodeV6 = PageNodeV6Base & { type: 'container'; props: {} };
export type TextNodeV6 = PageNodeV6Base & {
  type: 'text';
  props: { text: string; align?: 'left' | 'center' | 'right' | undefined };
};
export type ImageNodeV6 = PageNodeV6Base & {
  type: 'image';
  props: { src: string; alt: string };
};
export type ButtonNodeV6 = PageNodeV6Base & {
  type: 'button';
  props: { label: string; href: string; target: '_self' | '_blank' };
};
export type FormNodeV6 = PageNodeV6Base & { type: 'form'; props: FormProps };
export type CountdownNodeV6 = PageNodeV6Base & {
  type: 'countdown';
  props: CountdownProps;
};
export type ExtensionNodeV6 = PageNodeV6Base & {
  type: 'extension';
  props: CustomExtensionNodeProps;
};
export type HeadingNodeV6 = PageNodeV6Base & { type: 'heading'; props: HeadingProps };
export type LinkNodeV6 = PageNodeV6Base & { type: 'link'; props: LinkProps };
export type DividerNodeV6 = PageNodeV6Base & { type: 'divider'; props: {} };
export type ListNodeV6 = PageNodeV6Base & { type: 'list'; props: ListProps };
export type VideoNodeV6 = PageNodeV6Base & { type: 'video'; props: VideoProps };
export type QuoteNodeV6 = PageNodeV6Base & { type: 'quote'; props: QuoteProps };
export type AccordionNodeV6 = PageNodeV6Base & {
  type: 'accordion';
  props: AccordionPropsV6;
};
export type AccordionItemNodeV6 = PageNodeV6Base & {
  type: 'accordion-item';
  props: AccordionItemProps;
};
export type TabsNodeV6 = PageNodeV6Base & { type: 'tabs'; props: TabsPropsV6 };
export type TabItemNodeV6 = PageNodeV6Base & { type: 'tab-item'; props: TabItemProps };
export type GalleryNodeV6 = PageNodeV6Base & { type: 'gallery'; props: {} };
export type GlobalHeaderNodeV6 = PageNodeV6Base & {
  type: 'global-header';
  props: GlobalHeaderProps;
};
export type GlobalFooterNodeV6 = PageNodeV6Base & {
  type: 'global-footer';
  props: GlobalFooterProps;
};
export type NavigationViewNodeV6 = PageNodeV6Base & {
  type: 'navigation-view';
  props: NavigationViewProps;
};
export type SiteBrandNodeV6 = PageNodeV6Base & {
  type: 'site-brand';
  props: SiteBrandProps;
};
export type PageNodeV6 =
  | RootNodeV6
  | SectionNodeV6
  | ContainerNodeV6
  | TextNodeV6
  | ImageNodeV6
  | ButtonNodeV6
  | FormNodeV6
  | CountdownNodeV6
  | ExtensionNodeV6
  | HeadingNodeV6
  | LinkNodeV6
  | DividerNodeV6
  | ListNodeV6
  | VideoNodeV6
  | QuoteNodeV6
  | AccordionNodeV6
  | AccordionItemNodeV6
  | TabsNodeV6
  | TabItemNodeV6
  | GalleryNodeV6
  | GlobalHeaderNodeV6
  | GlobalFooterNodeV6
  | NavigationViewNodeV6
  | SiteBrandNodeV6;

const pageNodeV6Children = () => z.array(PageNodeV6Schema);
const pageNodeV6Base = <
  T extends z.ZodTypeAny,
  P extends z.ZodTypeAny,
  C extends z.ZodTypeAny,
>(
  type: T,
  props: P,
  children: C,
) =>
  z
    .object({
      id: pageNodeId,
      type,
      props,
      style: PageNodeStyleSchema.optional(),
      partsStyle: PageNodePartsStyleSchema.optional(),
      children,
    })
    .strict();

export const PageNodeV6Schema: z.ZodType<PageNodeV6> = z.lazy(() =>
  z.discriminatedUnion('type', [
    pageNodeV6Base(z.literal('root'), z.object({}).strict(), pageNodeV6Children()),
    pageNodeV6Base(z.literal('section'), z.object({}).strict(), pageNodeV6Children()),
    pageNodeV6Base(z.literal('container'), z.object({}).strict(), pageNodeV6Children()),
    pageNodeV6Base(
      z.literal('text'),
      z
        .object({
          text: nonEmptyText.max(PAGE_PAYLOAD_MAX_TEXT_LENGTH),
          align: z.enum(['left', 'center', 'right']).optional(),
        })
        .strict(),
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(
      z.literal('image'),
      z.object({ src: safeImageSource, alt: z.string().trim().max(500) }).strict(),
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(
      z.literal('button'),
      z
        .object({
          label: nonEmptyText.max(200),
          href: safeButtonHref,
          target: z.enum(['_self', '_blank']),
        })
        .strict(),
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(z.literal('form'), FormPropsSchema, z.array(z.never()).length(0)),
    pageNodeV6Base(
      z.literal('countdown'),
      CountdownPropsSchema,
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(
      z.literal('extension'),
      CustomExtensionNodePropsSchema,
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(
      z.literal('heading'),
      HeadingPropsSchema,
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(z.literal('link'), LinkPropsSchema, z.array(z.never()).length(0)),
    pageNodeV6Base(
      z.literal('divider'),
      z.object({}).strict(),
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(z.literal('list'), ListPropsSchema, z.array(z.never()).length(0)),
    pageNodeV6Base(z.literal('video'), VideoPropsSchema, z.array(z.never()).length(0)),
    pageNodeV6Base(z.literal('quote'), QuotePropsSchema, z.array(z.never()).length(0)),
    pageNodeV6Base(z.literal('accordion'), AccordionPropsV6Schema, pageNodeV6Children()),
    pageNodeV6Base(
      z.literal('accordion-item'),
      AccordionItemPropsSchema,
      pageNodeV6Children(),
    ),
    pageNodeV6Base(z.literal('tabs'), TabsPropsV6Schema, pageNodeV6Children()),
    pageNodeV6Base(z.literal('tab-item'), TabItemPropsSchema, pageNodeV6Children()),
    pageNodeV6Base(z.literal('gallery'), z.object({}).strict(), pageNodeV6Children()),
    pageNodeV6Base(
      z.literal('global-header'),
      GlobalHeaderPropsSchema,
      pageNodeV6Children(),
    ),
    pageNodeV6Base(
      z.literal('global-footer'),
      GlobalFooterPropsSchema,
      pageNodeV6Children(),
    ),
    pageNodeV6Base(
      z.literal('navigation-view'),
      NavigationViewPropsSchema,
      z.array(z.never()).length(0),
    ),
    pageNodeV6Base(
      z.literal('site-brand'),
      SiteBrandPropsSchema,
      z.array(z.never()).length(0),
    ),
  ]),
);

export const PagePayloadV6Schema = z
  .object({
    version: z.literal(6),
    metadata: PagePayloadV1Schema.shape.metadata,
    root: PageNodeV6Schema,
  })
  .strict()
  .superRefine((payload, context) => {
    validatePagePayloadDoesNotContainGlobals(payload, context);
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The payload root must have type root and id root',
        path: ['root'],
      });
    }
    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNodeV6; path: (string | number)[]; depth: number }> =
      [{ node: payload.root, path: ['root'], depth: 1 }];
    let nodeCount = 0;
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      nodeCount += 1;
      if (nodeCount > PAGE_PAYLOAD_MAX_NODES) {
        context.addIssue({
          code: 'custom',
          message: `PAGE_PAYLOAD_NODE_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_NODES}`,
          path: current.path,
        });
        break;
      }
      if (current.depth > PAGE_PAYLOAD_MAX_TREE_DEPTH) {
        context.addIssue({
          code: 'custom',
          message: `PAGE_PAYLOAD_DEPTH_LIMIT_EXCEEDED: maximum is ${PAGE_PAYLOAD_MAX_TREE_DEPTH}`,
          path: current.path,
        });
        continue;
      }
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate page node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);
      const definition = PAGE_COMPONENT_REGISTRY[current.node.type];
      for (const [partName, partStyle] of Object.entries(current.node.partsStyle ?? {})) {
        const part = definition.componentParts[partName];
        if (!part) {
          context.addIssue({
            code: 'custom',
            message: `Unknown ${current.node.type} component part: ${partName}`,
            path: [...current.path, 'partsStyle', partName],
          });
          continue;
        }
        for (const viewport of ['base', 'tablet', 'mobile'] as const) {
          for (const property of Object.keys(partStyle[viewport] ?? {})) {
            if (
              !part.styleCapabilities.includes(
                PAGE_STYLE_PROPERTY_BY_PAYLOAD_KEY[property]?.key as never,
              )
            ) {
              context.addIssue({
                code: 'custom',
                message: `Style property ${property} is not allowed for ${current.node.type}.${partName}`,
                path: [...current.path, 'partsStyle', partName, viewport, property],
              });
            }
          }
        }
      }
      for (const child of current.node.children) {
        if (!isPageComponentType(child.type)) {
          context.addIssue({
            code: 'custom',
            message: `Unknown page component type: ${child.type}`,
            path: [...current.path, 'children'],
          });
          continue;
        }
        const slot = definition.slots.find((candidate) =>
          candidate.accepts.includes(child.type),
        );
        if (!slot) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children'],
          });
        }
        pending.push({
          node: child,
          path: [...current.path, 'children'],
          depth: current.depth + 1,
        });
      }
      for (const slot of definition.slots) {
        const count = current.node.children.filter((child) =>
          slot.accepts.includes(child.type),
        ).length;
        if (slot.minChildren !== undefined && count < slot.minChildren)
          context.addIssue({
            code: 'custom',
            message: `${current.node.type} requires at least ${slot.minChildren} ${slot.label.toLowerCase()}`,
            path: [...current.path, 'children'],
          });
        if (slot.maxChildren !== undefined && count > slot.maxChildren)
          context.addIssue({
            code: 'custom',
            message: `${current.node.type} allows at most ${slot.maxChildren} ${slot.label.toLowerCase()}`,
            path: [...current.path, 'children'],
          });
      }
      validateAccordionOpenState(current.node, context, current.path);
    }
    const serializedSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (serializedSize > PAGE_PAYLOAD_MAX_SERIALIZED_BYTES)
      context.addIssue({
        code: 'custom',
        message: `PAGE_PAYLOAD_TOO_LARGE: maximum serialized size is ${PAGE_PAYLOAD_MAX_SERIALIZED_BYTES} bytes`,
        path: [],
      });
  });

export type PagePayloadV6 = z.infer<typeof PagePayloadV6Schema>;
export type AnyPageNode =
  PageNode | PageNodeV2 | PageNodeV3 | PageNodeV4 | PageNodeV5 | PageNodeV6;
export const PagePayloadSchema = z.discriminatedUnion('version', [
  PagePayloadV1Schema,
  PagePayloadV2Schema,
  PagePayloadV3Schema,
  PagePayloadV4Schema,
  PagePayloadV5Schema,
  PagePayloadV6Schema,
]);
export type PagePayload = z.infer<typeof PagePayloadSchema>;

export const SITE_GLOBAL_COMPONENT_TYPES = [
  'global-header',
  'global-footer',
  'navigation-view',
  'site-brand',
] as const;
export type SiteGlobalComponentType = (typeof SITE_GLOBAL_COMPONENT_TYPES)[number];

export function isSiteGlobalComponentType(
  value: unknown,
): value is SiteGlobalComponentType {
  return (
    typeof value === 'string' &&
    (SITE_GLOBAL_COMPONENT_TYPES as readonly string[]).includes(value)
  );
}

function validatePagePayloadDoesNotContainGlobals(
  payload: PagePayloadV6,
  context: z.RefinementCtx,
): void {
  const pending: Array<{ node: PageNodeV6; path: (string | number)[] }> = [
    { node: payload.root, path: ['root'] },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (isSiteGlobalComponentType(current.node.type)) {
      context.addIssue({
        code: 'custom',
        message: `${current.node.type} is only valid in a site global document`,
        path: [...current.path, 'type'],
      });
    }
    current.node.children.forEach((child, index) =>
      pending.push({ node: child, path: [...current.path, 'children', index] }),
    );
  }
}

export const SiteGlobalPayloadV1Schema = z
  .object({
    version: z.literal(1),
    documentKind: z.enum(['site-header', 'site-footer']),
    metadata: PagePayloadV1Schema.shape.metadata,
    root: PageNodeV6Schema,
  })
  .strict()
  .superRefine((payload, context) => {
    const expectedRootType =
      payload.documentKind === 'site-header' ? 'global-header' : 'global-footer';
    if (payload.root.type !== 'root' || payload.root.id !== 'root') {
      context.addIssue({
        code: 'custom',
        message: 'The site global root must have type root and id root',
        path: ['root'],
      });
    }
    const rootGlobals = payload.root.children.filter(
      (child) => child.type === 'global-header' || child.type === 'global-footer',
    );
    if (
      payload.root.children.length !== 1 ||
      rootGlobals.length !== 1 ||
      rootGlobals[0]?.type !== expectedRootType
    ) {
      context.addIssue({
        code: 'custom',
        message: `A ${payload.documentKind} document must contain exactly one ${expectedRootType} root child`,
        path: ['root', 'children'],
      });
    }

    const nodeIds = new Set<string>();
    const pending: Array<{ node: PageNodeV6; path: (string | number)[] }> = [
      { node: payload.root, path: ['root'] },
    ];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      if (nodeIds.has(current.node.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate site global node id: ${current.node.id}`,
          path: [...current.path, 'id'],
        });
      }
      nodeIds.add(current.node.id);
      const definition = PAGE_COMPONENT_REGISTRY[current.node.type];
      if (!definition.builder.documentKinds.includes(payload.documentKind)) {
        context.addIssue({
          code: 'custom',
          message: `${current.node.type} is not available in ${payload.documentKind} documents`,
          path: [...current.path, 'type'],
        });
      }
      current.node.children.forEach((child, index) => {
        const slot = definition.slots.find((candidate) =>
          candidate.accepts.includes(child.type),
        );
        if (!slot) {
          context.addIssue({
            code: 'custom',
            message: `Node type ${current.node.type} cannot contain ${child.type} children`,
            path: [...current.path, 'children', index, 'type'],
          });
        }
        pending.push({ node: child, path: [...current.path, 'children', index] });
      });
      for (const slot of definition.slots) {
        const count = current.node.children.filter((child) =>
          slot.accepts.includes(child.type),
        ).length;
        if (slot.minChildren !== undefined && count < slot.minChildren) {
          context.addIssue({
            code: 'custom',
            message: `${current.node.type} requires at least ${slot.minChildren} ${slot.label.toLowerCase()}`,
            path: [...current.path, 'children'],
          });
        }
        if (slot.maxChildren !== undefined && count > slot.maxChildren) {
          context.addIssue({
            code: 'custom',
            message: `${current.node.type} allows at most ${slot.maxChildren} ${slot.label.toLowerCase()}`,
            path: [...current.path, 'children'],
          });
        }
      }
    }
  });
export type SiteGlobalPayloadV1 = z.infer<typeof SiteGlobalPayloadV1Schema>;

export const SocialLinkSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    platform: z.enum([
      'facebook',
      'instagram',
      'linkedin',
      'x',
      'youtube',
      'tiktok',
      'zalo',
      'custom',
    ]),
    label: nonEmptyText.max(100),
    href: z
      .string()
      .trim()
      .max(2_048)
      .refine(isSafeMetadataUrl, 'URL must use http(s) or a safe relative path'),
  })
  .strict();
export type SocialLink = z.infer<typeof SocialLinkSchema>;

export const SiteGlobalsSchema = z
  .object({
    version: z.literal(1),
    header: SiteGlobalPayloadV1Schema.optional(),
    footer: SiteGlobalPayloadV1Schema.optional(),
    socialLinks: z.array(SocialLinkSchema).max(20).optional(),
  })
  .strict()
  .superRefine((globals, context) => {
    if (
      globals.header?.documentKind !== undefined &&
      globals.header.documentKind !== 'site-header'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Site globals.header must be a site-header document',
        path: ['header', 'documentKind'],
      });
    }
    if (
      globals.footer?.documentKind !== undefined &&
      globals.footer.documentKind !== 'site-footer'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Site globals.footer must be a site-footer document',
        path: ['footer', 'documentKind'],
      });
    }
  });
export type SiteGlobals = z.infer<typeof SiteGlobalsSchema>;

export const SiteGlobalsResponseSchema = z
  .object({
    draft: SiteGlobalsSchema,
    published: SiteGlobalsSchema.optional(),
  })
  .strict();
export type SiteGlobalsResponse = z.infer<typeof SiteGlobalsResponseSchema>;

/**
 * Editor-facing document envelope. The persisted/public payload remains the
 * versioned PagePayload union for backward compatibility; this explicit
 * envelope gives Editor Core a stable document identity without duplicating
 * the editable tree or introducing a second storage format.
 */
export const PAGE_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const PageDocumentSchema = z
  .object({
    schemaVersion: z.literal(PAGE_DOCUMENT_SCHEMA_VERSION),
    payload: PagePayloadSchema,
  })
  .strict();
export type PageDocument = z.infer<typeof PageDocumentSchema>;

export function createPageDocument(payload: PagePayload): PageDocument {
  return PageDocumentSchema.parse({
    schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    payload,
  });
}

export function parsePageDocument(input: unknown): PageDocument {
  return PageDocumentSchema.parse(input);
}

/**
 * Accepts the current editor envelope and the legacy persisted payload shape.
 * This is the migration seam for future document schema versions: callers can
 * normalize before initializing Editor Core without widening PagePayload.
 */
export function migratePageDocument(input: unknown): PageDocument {
  const document = PageDocumentSchema.safeParse(input);
  if (document.success) return document.data;
  return createPageDocument(PagePayloadSchema.parse(input));
}

export const PAGE_PREVIEW_MESSAGE_TYPE = 'payload-landing-page:preview' as const;
export const PAGE_PREVIEW_READY_MESSAGE_TYPE =
  'payload-landing-page:preview-ready' as const;
export const PagePreviewMessageSchema = z
  .object({
    type: z.literal(PAGE_PREVIEW_MESSAGE_TYPE),
    document: PageDocumentSchema,
  })
  .strict();
export type PagePreviewMessage = z.infer<typeof PagePreviewMessageSchema>;

export const PagePreviewReadyMessageSchema = z
  .object({ type: z.literal(PAGE_PREVIEW_READY_MESSAGE_TYPE) })
  .strict();

export * from './component-registry';
export * from './page-runtime';
export * from './style-registry';

export const PageCompositionSchema = z
  .object({
    pageId: EntityIdSchema,
    payload: PagePayloadSchema,
    attachments: z.array(PageExtensionAttachmentSchema).max(100),
    bindings: z.array(PageBindingSchema).max(200),
    actions: z.array(PageActionSchema).max(200),
    resources: z.array(PageResourceSchema).max(200),
  })
  .strict();
export type PageComposition = z.infer<typeof PageCompositionSchema>;

export const PublishedPageBundleSchema = z
  .object({
    bundleVersion: z.literal(1),
    pageId: EntityIdSchema,
    versionNumber: z.number().int().positive(),
    payload: PagePayloadSchema,
    attachments: z.array(PageExtensionAttachmentSchema).max(100),
    bindings: z.array(PageBindingSchema).max(200),
    actions: z.array(PageActionSchema).max(200),
    resources: z.array(PageResourceSchema).max(200),
    extensions: z.array(PageRuntimeExtensionSchema).max(100),
    extensionVersions: z.record(
      z.string().trim().min(1).max(120),
      z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    ),
    capabilities: z.array(z.string().trim().min(1).max(150)).max(200),
    runtimeIds: z.array(z.string().trim().min(1).max(150)).max(100),
    styleAssetIds: z.array(z.string().trim().min(1).max(150)).max(100),
    compiledAt: timestampSchema,
  })
  .strict();
export type PublishedPageBundle = z.infer<typeof PublishedPageBundleSchema>;

export function parsePagePayload(input: unknown): PagePayload {
  return PagePayloadSchema.parse(input);
}

export function serializePagePayload(payload: PagePayload): string {
  return JSON.stringify(parsePagePayload(payload));
}

export function deserializePagePayload(serialized: string): PagePayload {
  return parsePagePayload(JSON.parse(serialized) as unknown);
}

export const WorkspaceSchema = z
  .object({
    id: EntityIdSchema,
    organizationId: EntityIdSchema,
    name: nonEmptyText.max(200),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const OrganizationStatusSchema = z.enum(['active', 'suspended']);
export type OrganizationStatus = z.infer<typeof OrganizationStatusSchema>;

export const OrganizationRoleSchema = z.enum(['owner', 'admin', 'member']);
export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;

export const OrganizationSchema = z
  .object({
    id: EntityIdSchema,
    name: nonEmptyText.max(200),
    slug: OrganizationSlugSchema,
    status: OrganizationStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Organization = z.infer<typeof OrganizationSchema>;

export const OrganizationMembershipSchema = z
  .object({
    id: EntityIdSchema,
    organizationId: EntityIdSchema,
    userId: z.string().trim().min(1).max(320),
    role: OrganizationRoleSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;

export const OrganizationListResponseSchema = z
  .object({ items: z.array(OrganizationSchema) })
  .strict();
export const OrganizationMembershipListResponseSchema = z
  .object({ items: z.array(OrganizationMembershipSchema) })
  .strict();
export const WorkspaceListResponseSchema = z
  .object({ items: z.array(WorkspaceSchema) })
  .strict();
export type OrganizationListResponse = z.infer<typeof OrganizationListResponseSchema>;
export type OrganizationMembershipListResponse = z.infer<
  typeof OrganizationMembershipListResponseSchema
>;
export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;

export const AuthUserSchema = z
  .object({
    subject: z.string().min(1),
    email: z.string().email(),
    tenantId: EntityIdSchema.optional(),
    tenantSlug: z.string().trim().min(1).max(80).optional(),
    workspaceId: EntityIdSchema,
  })
  .strict();

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthSessionResponseSchema = z
  .object({
    user: AuthUserSchema,
    workspace: WorkspaceSchema,
    expiresAt: timestampSchema,
  })
  .strict();

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const TenantStatusSchema = z.enum([
  'provisioning',
  'active',
  'suspended',
  'failed',
  'archived',
]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z
  .object({
    id: EntityIdSchema,
    name: nonEmptyText.max(200),
    slug: OrganizationSlugSchema,
    status: TenantStatusSchema,
    databaseKey: z.string().trim().min(1).max(200),
    databaseName: z.string().trim().min(1).max(63),
    clusterKey: z.string().trim().min(1).max(100),
    schemaVersion: z.number().int().nonnegative(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Tenant = z.infer<typeof TenantSchema>;

export const TenantListResponseSchema = z
  .object({ items: z.array(TenantSchema) })
  .strict();
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;

export const PlanStatusSchema = z.enum(['active', 'inactive', 'archived']);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

const quotaLimitSchema = z.number().int().nonnegative().nullable();

export const PlanEntitlementsSchema = z
  .object({
    maxWorkspaces: quotaLimitSchema,
    maxLandingPages: quotaLimitSchema,
    maxCustomDomains: quotaLimitSchema,
    maxIntegrations: quotaLimitSchema,
    monthlyPageViews: quotaLimitSchema,
    monthlyFormSubmissions: quotaLimitSchema,
  })
  .strict();
export type PlanEntitlements = z.infer<typeof PlanEntitlementsSchema>;

export const PlanSchema = z
  .object({
    id: EntityIdSchema,
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: nonEmptyText.max(200),
    status: PlanStatusSchema,
    entitlements: PlanEntitlementsSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Plan = z.infer<typeof PlanSchema>;

export const PlanListResponseSchema = z.object({ items: z.array(PlanSchema) }).strict();
export type PlanListResponse = z.infer<typeof PlanListResponseSchema>;

export const CreatePlanRequestSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: nonEmptyText.max(200),
    entitlements: PlanEntitlementsSchema,
    status: PlanStatusSchema.default('active'),
  })
  .strict();
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>;

export const UpdatePlanRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    entitlements: PlanEntitlementsSchema.optional(),
    status: PlanStatusSchema.optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequestSchema>;

export const SubscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'suspended',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const BillingProviderSchema = z.enum(['manual', 'stripe']);
export type BillingProvider = z.infer<typeof BillingProviderSchema>;

export const TenantSubscriptionSchema = z
  .object({
    id: EntityIdSchema,
    tenantId: EntityIdSchema,
    planId: EntityIdSchema,
    status: SubscriptionStatusSchema,
    currentPeriodStart: timestampSchema,
    currentPeriodEnd: timestampSchema,
    cancelAtPeriodEnd: z.boolean(),
    provider: BillingProviderSchema,
    providerCustomerId: z.string().trim().min(1).max(200).optional(),
    providerSubscriptionId: z.string().trim().min(1).max(200).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type TenantSubscription = z.infer<typeof TenantSubscriptionSchema>;

export const SubscriptionStatusResponseSchema = z
  .object({ subscription: TenantSubscriptionSchema, plan: PlanSchema })
  .strict();
export type SubscriptionStatusResponse = z.infer<typeof SubscriptionStatusResponseSchema>;

export const AssignSubscriptionRequestSchema = z
  .object({
    planKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: SubscriptionStatusSchema.default('active'),
    currentPeriodStart: timestampSchema.optional(),
    currentPeriodEnd: timestampSchema.optional(),
  })
  .strict()
  .refine(
    (request) =>
      !request.currentPeriodStart ||
      !request.currentPeriodEnd ||
      request.currentPeriodStart < request.currentPeriodEnd,
    'currentPeriodStart must be before currentPeriodEnd',
  );
export type AssignSubscriptionRequest = z.infer<typeof AssignSubscriptionRequestSchema>;

export const BillingUsageMetricSchema = z.enum([
  'workspaces',
  'landing_pages',
  'custom_domains',
  'integrations',
  'page_views_monthly',
  'form_submissions_monthly',
]);
export type BillingUsageMetric = z.infer<typeof BillingUsageMetricSchema>;

export const TenantUsageSchema = z
  .object({
    id: EntityIdSchema,
    tenantId: EntityIdSchema,
    metric: BillingUsageMetricSchema,
    periodStart: timestampSchema,
    periodEnd: timestampSchema,
    value: z.number().int().nonnegative(),
    updatedAt: timestampSchema,
  })
  .strict();
export type TenantUsage = z.infer<typeof TenantUsageSchema>;

export const BillingUsageItemSchema = z
  .object({
    metric: BillingUsageMetricSchema,
    value: z.number().int().nonnegative(),
    limit: quotaLimitSchema,
    enforcement: z.enum(['hard', 'soft']),
    periodStart: timestampSchema,
    periodEnd: timestampSchema,
  })
  .strict();
export type BillingUsageItem = z.infer<typeof BillingUsageItemSchema>;

export const BillingUsageResponseSchema = z
  .object({
    tenantId: EntityIdSchema,
    periodStart: timestampSchema,
    periodEnd: timestampSchema,
    items: z.array(BillingUsageItemSchema),
  })
  .strict();
export type BillingUsageResponse = z.infer<typeof BillingUsageResponseSchema>;

export const BillingEntitlementsResponseSchema = z
  .object({
    tenantId: EntityIdSchema,
    planId: EntityIdSchema,
    planKey: z.string().min(1),
    entitlements: PlanEntitlementsSchema,
  })
  .strict();
export type BillingEntitlementsResponse = z.infer<
  typeof BillingEntitlementsResponseSchema
>;

export const BillingSummarySchema = z
  .object({
    subscription: TenantSubscriptionSchema,
    plan: PlanSchema,
    usage: BillingUsageResponseSchema,
  })
  .strict();
export type BillingSummary = z.infer<typeof BillingSummarySchema>;

export const CreateTenantRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z.string().trim().min(1).max(80).optional(),
    ownerEmail: z.string().trim().email(),
    ownerPassword: z.string().min(8).max(200),
    workspaceName: nonEmptyText.max(200).optional(),
  })
  .strict();
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const SiteSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    name: nonEmptyText.max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    homePageId: EntityIdSchema,
    status: z.enum(['draft', 'published', 'archived']),
    primaryNavigationId: EntityIdSchema.optional(),
    footerNavigationId: EntityIdSchema.optional(),
    logo: safeImageSource.optional(),
    officialUrl: z.string().url().optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const PageStatusSchema = z.enum(['draft', 'published', 'modified', 'archived']);
export type PageStatus = z.infer<typeof PageStatusSchema>;
export const PageKindSchema = z.enum([
  'standard',
  'landing',
  'system',
  'collection-template',
]);
export type PageKind = z.infer<typeof PageKindSchema>;

export const PageSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    siteId: EntityIdSchema,
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    path: PagePathSchema,
    kind: PageKindSchema,
    status: PageStatusSchema,
    parentId: EntityIdSchema.optional(),
    anchors: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/))
      .max(200)
      .optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    currentDraftVersionId: EntityIdSchema.optional(),
    publishedVersionId: EntityIdSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const PublicSiteSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    logo: safeImageSource.optional(),
  })
  .strict();

const PublicPageSummarySchema = z
  .object({
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict();

export const CustomDomainStatusSchema = z.enum([
  'pending',
  'verifying',
  'active',
  'failed',
]);
export type CustomDomainStatus = z.infer<typeof CustomDomainStatusSchema>;

export const DomainVerificationMethodSchema = z.literal('dns_txt');

const SafeMetadataUrlSchema = z
  .string()
  .trim()
  .max(MAX_SEO_URL_LENGTH)
  .refine(isSafeMetadataUrl, 'URL must use http(s) or a safe relative path');

const OptionalSeoText = (max: number) => z.string().trim().max(max).optional();
const NullableSeoText = (max: number) => z.string().trim().max(max).nullable().optional();

export const CustomDomainSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    siteId: EntityIdSchema.optional(),
    hostname: z.string().trim().max(MAX_HOSTNAME_LENGTH),
    status: CustomDomainStatusSchema,
    verificationMethod: DomainVerificationMethodSchema,
    verificationHostname: z.string().trim().max(MAX_HOSTNAME_LENGTH),
    verificationToken: z.string().trim().min(32).max(256).optional(),
    verifiedAt: timestampSchema.optional(),
    lastCheckedAt: timestampSchema.optional(),
    failureReason: z.string().trim().max(500).optional(),
    landingPageId: EntityIdSchema.optional(),
    isPrimary: z.boolean(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type CustomDomain = z.infer<typeof CustomDomainSchema>;

export const CreateCustomDomainRequestSchema = z
  .object({
    hostname: z
      .string()
      .trim()
      .min(1)
      .max(MAX_HOSTNAME_LENGTH + 32),
    landingPageId: EntityIdSchema.optional(),
    siteId: EntityIdSchema.optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export const UpdateCustomDomainRequestSchema = z
  .object({
    landingPageId: EntityIdSchema.nullable().optional(),
    siteId: EntityIdSchema.nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');

export const CustomDomainListResponseSchema = z
  .object({ items: z.array(CustomDomainSchema) })
  .strict();

export type CreateCustomDomainRequest = z.infer<typeof CreateCustomDomainRequestSchema>;
export type UpdateCustomDomainRequest = z.infer<typeof UpdateCustomDomainRequestSchema>;
export type CustomDomainListResponse = z.infer<typeof CustomDomainListResponseSchema>;

export const PageSeoSettingsSchema = z
  .object({
    pageId: EntityIdSchema,
    workspaceId: EntityIdSchema,
    title: OptionalSeoText(MAX_SEO_TITLE_LENGTH),
    description: OptionalSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    canonicalUrl: SafeMetadataUrlSchema.optional(),
    noIndex: z.boolean(),
    noFollow: z.boolean(),
    ogTitle: OptionalSeoText(MAX_SEO_TITLE_LENGTH),
    ogDescription: OptionalSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    ogImage: SafeMetadataUrlSchema.optional(),
    twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
    twitterTitle: OptionalSeoText(MAX_SEO_TITLE_LENGTH),
    twitterDescription: OptionalSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    twitterImage: SafeMetadataUrlSchema.optional(),
    favicon: SafeMetadataUrlSchema.optional(),
  })
  .strict();

export type PageSeoSettings = z.infer<typeof PageSeoSettingsSchema>;

export const UpdatePageSeoSettingsRequestSchema = z
  .object({
    title: NullableSeoText(MAX_SEO_TITLE_LENGTH),
    description: NullableSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    canonicalUrl: SafeMetadataUrlSchema.nullable().optional(),
    noIndex: z.boolean().optional(),
    noFollow: z.boolean().optional(),
    ogTitle: NullableSeoText(MAX_SEO_TITLE_LENGTH),
    ogDescription: NullableSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    ogImage: SafeMetadataUrlSchema.nullable().optional(),
    twitterCard: z.enum(['summary', 'summary_large_image']).nullable().optional(),
    twitterTitle: NullableSeoText(MAX_SEO_TITLE_LENGTH),
    twitterDescription: NullableSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    twitterImage: SafeMetadataUrlSchema.nullable().optional(),
    favicon: SafeMetadataUrlSchema.nullable().optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');

export type UpdatePageSeoSettingsRequest = z.infer<
  typeof UpdatePageSeoSettingsRequestSchema
>;

export const NavigationItemTypeSchema = z.enum(['page', 'section', 'external', 'action']);
export type NavigationItemType = z.infer<typeof NavigationItemTypeSchema>;

export const NavigationActionTypeSchema = z.enum([
  'phone',
  'email',
  'download',
  'custom',
]);
export type NavigationActionType = z.infer<typeof NavigationActionTypeSchema>;

const safeNavigationActionUrl = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine((value) => isSafeMetadataUrl(value) || isAnchor(value));
const NavigationActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('phone'),
      value: z.string().regex(/^\+?[0-9(). -]{3,32}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('email'),
      value: z.string().regex(/^(?:mailto:)?[^\s@]+@[^\s@]+\.[^\s@]+$/i),
    })
    .strict(),
  z.object({ type: z.literal('download'), value: safeNavigationActionUrl }).strict(),
  z.object({ type: z.literal('custom'), value: safeNavigationActionUrl }).strict(),
]);

export type NavigationItem = {
  id: string;
  label: string;
  type: NavigationItemType;
  pageId?: string | undefined;
  anchorId?: string | undefined;
  externalUrl?: string | undefined;
  action?: { type: NavigationActionType; value: string } | undefined;
  openInNewTab?: boolean | undefined;
  children?: NavigationItem[] | undefined;
};

const navigationItemChildren = () => z.array(NavigationItemSchema).max(50);
export const NavigationItemSchema: z.ZodType<NavigationItem> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({
        id: EntityIdSchema,
        label: nonEmptyText.max(200),
        type: z.literal('page'),
        pageId: EntityIdSchema,
        openInNewTab: z.boolean().optional(),
        children: navigationItemChildren().optional(),
      })
      .strict(),
    z
      .object({
        id: EntityIdSchema,
        label: nonEmptyText.max(200),
        type: z.literal('section'),
        pageId: EntityIdSchema,
        anchorId: z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/),
        openInNewTab: z.boolean().optional(),
        children: navigationItemChildren().optional(),
      })
      .strict(),
    z
      .object({
        id: EntityIdSchema,
        label: nonEmptyText.max(200),
        type: z.literal('external'),
        externalUrl: z
          .string()
          .url()
          .refine((value) => /^https?:\/\//i.test(value)),
        openInNewTab: z.boolean().optional(),
        children: navigationItemChildren().optional(),
      })
      .strict(),
    z
      .object({
        id: EntityIdSchema,
        label: nonEmptyText.max(200),
        type: z.literal('action'),
        action: NavigationActionSchema,
        openInNewTab: z.boolean().optional(),
        children: navigationItemChildren().optional(),
      })
      .strict(),
  ]),
);

export const NavigationSchema = z
  .object({
    id: EntityIdSchema,
    siteId: EntityIdSchema,
    name: nonEmptyText.max(200),
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    items: z.array(NavigationItemSchema).max(100),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Navigation = z.infer<typeof NavigationSchema>;

export type ResolvedNavigationItem = {
  id: string;
  label: string;
  type: NavigationItemType;
  href: string;
  openInNewTab?: boolean | undefined;
  children?: ResolvedNavigationItem[] | undefined;
};

export const ResolvedNavigationItemSchema: z.ZodType<ResolvedNavigationItem> = z.lazy(
  () =>
    z
      .object({
        id: EntityIdSchema,
        label: nonEmptyText.max(200),
        type: NavigationItemTypeSchema,
        href: z
          .string()
          .min(1)
          .max(MAX_PAGE_PATH_LENGTH + 2_048),
        openInNewTab: z.boolean().optional(),
        children: z.array(ResolvedNavigationItemSchema).max(50).optional(),
      })
      .strict(),
);

export const NavigationListResponseSchema = z
  .object({ items: z.array(NavigationSchema) })
  .strict();
export type NavigationListResponse = z.infer<typeof NavigationListResponseSchema>;

export const CreateNavigationRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    items: z.array(NavigationItemSchema).max(100).default([]),
  })
  .strict();
export const UpdateNavigationRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    items: z.array(NavigationItemSchema).max(100).optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');
export type CreateNavigationRequest = z.infer<typeof CreateNavigationRequestSchema>;
export type UpdateNavigationRequest = z.infer<typeof UpdateNavigationRequestSchema>;

export const SiteManifestSchema = z
  .object({
    version: z.literal(1),
    siteId: EntityIdSchema,
    homePageId: EntityIdSchema,
    routes: z.record(z.string(), EntityIdSchema),
    navigation: z
      .object({ main: EntityIdSchema.optional(), footer: EntityIdSchema.optional() })
      .strict(),
    globals: z
      .object({ header: EntityIdSchema.optional(), footer: EntityIdSchema.optional() })
      .strict(),
    publishedAt: timestampSchema.optional(),
  })
  .strict();
export type SiteManifest = z.infer<typeof SiteManifestSchema>;

export const SiteUrlResponseSchema = z
  .object({
    siteId: EntityIdSchema,
    url: z.string().url().optional(),
    published: z.boolean(),
  })
  .strict();
export type SiteUrlResponse = z.infer<typeof SiteUrlResponseSchema>;

export const PublicSiteRoutesSchema = z
  .object({ urls: z.array(z.string().url()).max(2_000) })
  .strict();
export type PublicSiteRoutes = z.infer<typeof PublicSiteRoutesSchema>;

export const PublicSeoSettingsSchema = z
  .object({
    title: OptionalSeoText(MAX_SEO_TITLE_LENGTH),
    description: OptionalSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    canonicalUrl: SafeMetadataUrlSchema.optional(),
    noIndex: z.boolean().optional(),
    noFollow: z.boolean().optional(),
    ogTitle: OptionalSeoText(MAX_SEO_TITLE_LENGTH),
    ogDescription: OptionalSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    ogImage: SafeMetadataUrlSchema.optional(),
    twitterCard: z.enum(['summary', 'summary_large_image']).optional(),
    twitterTitle: OptionalSeoText(MAX_SEO_TITLE_LENGTH),
    twitterDescription: OptionalSeoText(MAX_SEO_DESCRIPTION_LENGTH),
    twitterImage: SafeMetadataUrlSchema.optional(),
    favicon: SafeMetadataUrlSchema.optional(),
  })
  .strict();

export const PublicPageSchema = z
  .object({
    tenantSlug: z.string().trim().min(1).max(80).optional(),
    site: PublicSiteSchema,
    page: PublicPageSummarySchema,
    payload: PagePayloadSchema,
    extensions: z.array(PageRuntimeExtensionSchema).optional(),
    seo: PublicSeoSettingsSchema.optional(),
    canonicalUrl: z.string().url().optional(),
    navigation: z
      .object({
        main: z.array(ResolvedNavigationItemSchema).optional(),
        footer: z.array(ResolvedNavigationItemSchema).optional(),
      })
      .strict()
      .optional(),
    globals: SiteGlobalsSchema.optional(),
  })
  .strict();

export const PageVersionSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    siteId: EntityIdSchema,
    landingPageId: EntityIdSchema,
    versionNumber: z.number().int().positive(),
    payload: PagePayloadSchema,
    createdAt: timestampSchema,
  })
  .strict();

export const AssetSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    filename: nonEmptyText.max(255),
    mimeType: nonEmptyText.max(100),
    size: z.number().int().nonnegative(),
    storageKey: nonEmptyText.max(500),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const TemplateSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    payload: PagePayloadSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type Page = z.infer<typeof PageSchema>;
export type PublicPage = z.infer<typeof PublicPageSchema>;
export type PageVersion = z.infer<typeof PageVersionSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Template = z.infer<typeof TemplateSchema>;

/** @deprecated Use PageSchema/Page instead. Kept for API client compatibility. */
export const LandingPageSchema = PageSchema;
/** @deprecated Use PublicPageSchema/PublicPage instead. */
export const PublicLandingPageSchema = PublicPageSchema;
/** @deprecated Use Page instead. */
export type LandingPage = Page;
/** @deprecated Use PublicPage instead. */
export type PublicLandingPage = PublicPage;

export const PaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const PaginationSchema = z
  .object({
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  })
  .strict();

export const PageListResponseSchema = z
  .object({ items: z.array(PageSchema), pagination: PaginationSchema })
  .strict();

export const PageVersionListResponseSchema = z
  .object({ items: z.array(PageVersionSchema), pagination: PaginationSchema })
  .strict();

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type PageListResponse = z.infer<typeof PageListResponseSchema>;
export type PageVersionListResponse = z.infer<typeof PageVersionListResponseSchema>;

export const SiteListResponseSchema = z
  .object({ items: z.array(SiteSchema), pagination: PaginationSchema })
  .strict();

export const AssetListResponseSchema = z
  .object({ items: z.array(AssetSchema), pagination: PaginationSchema })
  .strict();

export const TemplateListResponseSchema = z
  .object({ items: z.array(TemplateSchema), pagination: PaginationSchema })
  .strict();

export type SiteListResponse = z.infer<typeof SiteListResponseSchema>;
export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;
export type TemplateListResponse = z.infer<typeof TemplateListResponseSchema>;

export const CreateWorkspaceRequestSchema = z
  .object({ name: nonEmptyText.max(200) })
  .strict();
export const CreateOrganizationRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
export const UpdateOrganizationRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    slug: z.string().trim().min(1).max(80).optional(),
    status: OrganizationStatusSchema.optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');
export const CreateOrganizationMembershipRequestSchema = z
  .object({
    userId: z.string().trim().min(1).max(320),
    role: OrganizationRoleSchema.default('member'),
  })
  .strict();
export const UpdateOrganizationMembershipRequestSchema = z
  .object({ role: OrganizationRoleSchema })
  .strict();
export const SwitchAuthContextRequestSchema = z
  .object({
    organizationId: EntityIdSchema,
    workspaceId: EntityIdSchema,
  })
  .strict();
export const CreateSiteRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    logo: safeImageSource.optional(),
  })
  .strict();
export const UpdateSiteRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    logo: safeImageSource.nullable().optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');
export const CreatePageRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    path: PagePathSchema.optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    parentId: EntityIdSchema.optional(),
    kind: PageKindSchema.optional(),
    anchors: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/))
      .max(200)
      .optional(),
    payload: PagePayloadSchema,
  })
  .strict();
export const UpdatePageRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    path: PagePathSchema.nullable().optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
    payload: PagePayloadSchema.optional(),
    parentId: EntityIdSchema.nullable().optional(),
    kind: PageKindSchema.optional(),
    anchors: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,127}$/))
      .max(200)
      .optional(),
    expectedVersionNumber: z.number().int().positive().optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');
export const CreatePageVersionRequestSchema = z
  .object({
    payload: PagePayloadSchema,
    expectedVersionNumber: z.number().int().positive().optional(),
  })
  .strict();

export const PublishPageRequestSchema = z
  .object({
    versionNumber: z.number().int().positive().optional(),
  })
  .strict();

export const DuplicatePageRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    path: PagePathSchema.optional(),
  })
  .strict();

export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>;
export type CreateOrganizationMembershipRequest = z.infer<
  typeof CreateOrganizationMembershipRequestSchema
>;
export type UpdateOrganizationMembershipRequest = z.infer<
  typeof UpdateOrganizationMembershipRequestSchema
>;
export type SwitchAuthContextRequest = z.infer<typeof SwitchAuthContextRequestSchema>;
export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;
export type CreatePageRequest = z.infer<typeof CreatePageRequestSchema>;
export type UpdatePageRequest = z.infer<typeof UpdatePageRequestSchema>;
export type CreatePageVersionRequest = z.infer<typeof CreatePageVersionRequestSchema>;
export type PublishPageRequest = z.infer<typeof PublishPageRequestSchema>;
export type DuplicatePageRequest = z.infer<typeof DuplicatePageRequestSchema>;

export const CreateAssetRequestSchema = z
  .object({
    filename: nonEmptyText.max(255),
    mimeType: nonEmptyText.max(100),
    size: z.number().int().nonnegative(),
    storageKey: nonEmptyText.max(500),
  })
  .strict();

export const CreateTemplateRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    description: z.string().trim().max(500).optional(),
    payload: PagePayloadSchema,
  })
  .strict();

export const UpdateTemplateRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');

export type CreateAssetRequest = z.infer<typeof CreateAssetRequestSchema>;
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;
export type UpdateTemplateRequest = z.infer<typeof UpdateTemplateRequestSchema>;

export const SubmissionStatusSchema = z.enum(['new', 'read', 'archived']);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

const submissionValueSchema = z.union([
  z.string().max(FORM_MAX_FIELD_VALUE_LENGTH),
  z.boolean(),
]);

export const SubmitFormRequestSchema = z
  .object({
    values: z
      .array(
        z
          .object({
            fieldId: formIdentifier,
            value: submissionValueSchema,
          })
          .strict(),
      )
      .min(1)
      .max(FORM_MAX_SUBMISSION_FIELDS),
    analyticsSessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,128}$/)
      .optional(),
    website: z.string().max(200).optional(),
  })
  .strict();
export type SubmitFormRequest = z.infer<typeof SubmitFormRequestSchema>;
export const SubmitFormResponseSchema = z.object({ success: z.literal(true) }).strict();
export type SubmitFormResponse = z.infer<typeof SubmitFormResponseSchema>;

export const SubmissionFieldSchema = z
  .object({
    fieldId: formIdentifier,
    label: formLabel,
    name: formIdentifier,
    type: z.enum(['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'radio']),
    value: submissionValueSchema,
  })
  .strict();
export type SubmissionField = z.infer<typeof SubmissionFieldSchema>;

export const FormSubmissionSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    siteId: EntityIdSchema,
    siteName: nonEmptyText.max(200),
    landingPageId: EntityIdSchema,
    pageName: nonEmptyText.max(200),
    pagePath: PagePathSchema.optional(),
    pageSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    pageVersionId: EntityIdSchema,
    formNodeId: pageNodeId,
    fields: z.array(SubmissionFieldSchema).max(FORM_MAX_SUBMISSION_FIELDS),
    status: SubmissionStatusSchema,
    submittedAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type FormSubmission = z.infer<typeof FormSubmissionSchema>;

export const SubmissionListQuerySchema = PaginationQuerySchema.extend({
  siteId: EntityIdSchema.optional(),
  landingPageId: EntityIdSchema.optional(),
  status: SubmissionStatusSchema.optional(),
  search: z.string().trim().max(100).optional(),
  dateFrom: timestampSchema.optional(),
  dateTo: timestampSchema.optional(),
})
  .strict()
  .refine(
    (query) => !query.dateFrom || !query.dateTo || query.dateFrom <= query.dateTo,
    'dateFrom must be before dateTo',
  );
export type SubmissionListQuery = z.infer<typeof SubmissionListQuerySchema>;

export const SubmissionListResponseSchema = z
  .object({ items: z.array(FormSubmissionSchema), pagination: PaginationSchema })
  .strict();
export type SubmissionListResponse = z.infer<typeof SubmissionListResponseSchema>;

export const UpdateSubmissionRequestSchema = z
  .object({ status: SubmissionStatusSchema })
  .strict();
export type UpdateSubmissionRequest = z.infer<typeof UpdateSubmissionRequestSchema>;

// Phase 8 analytics deliberately accepts a small, versioned browser contract.
// Workspace and database ids are resolved server-side from the published slug pair.
export const AnalyticsEventTypeSchema = z.enum([
  'page.viewed',
  'form.submitted',
  'element.clicked',
]);
export type AnalyticsEventType = z.infer<typeof AnalyticsEventTypeSchema>;

const analyticsSessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const analyticsSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const analyticsContextSchema = z
  .object({
    referrer: z.string().max(2_048).optional(),
    utmSource: z.string().trim().max(100).optional(),
    utmMedium: z.string().trim().max(100).optional(),
    utmCampaign: z.string().trim().max(100).optional(),
    utmTerm: z.string().trim().max(100).optional(),
    utmContent: z.string().trim().max(100).optional(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).optional(),
  })
  .strict();

export const AnalyticsEventV1Schema = z
  .discriminatedUnion('event', [
    z
      .object({
        version: z.literal(1),
        event: z.literal('page.viewed'),
        siteSlug: analyticsSlugSchema,
        pagePath: PagePathSchema.optional(),
        pageSlug: analyticsSlugSchema.optional(),
        sessionId: analyticsSessionIdSchema,
        occurredAt: timestampSchema.optional(),
        context: analyticsContextSchema.optional(),
      })
      .strict(),
    z
      .object({
        version: z.literal(1),
        event: z.literal('element.clicked'),
        siteSlug: analyticsSlugSchema,
        pagePath: PagePathSchema.optional(),
        pageSlug: analyticsSlugSchema.optional(),
        nodeId: pageNodeId,
        sessionId: analyticsSessionIdSchema,
        occurredAt: timestampSchema.optional(),
        context: analyticsContextSchema.optional(),
      })
      .strict(),
  ])
  .refine(
    (event) => event.pagePath !== undefined || event.pageSlug !== undefined,
    'A page path is required',
  );
export type AnalyticsEventV1 = z.infer<typeof AnalyticsEventV1Schema>;
export const AnalyticsClientEventV1Schema = AnalyticsEventV1Schema;
export type AnalyticsClientEventV1 = AnalyticsEventV1;

export const AnalyticsStoredEventV1Schema = z
  .object({
    version: z.literal(1),
    event: AnalyticsEventTypeSchema,
    workspaceId: EntityIdSchema,
    siteId: EntityIdSchema,
    landingPageId: EntityIdSchema,
    pageVersionId: EntityIdSchema,
    publishedVersionNumber: z.number().int().positive(),
    nodeId: pageNodeId.optional(),
    elementType: z.string().max(50).optional(),
    sessionId: analyticsSessionIdSchema.optional(),
    formSubmissionId: EntityIdSchema.optional(),
    occurredAt: timestampSchema,
    receivedAt: timestampSchema,
    referrerHost: z.string().max(253).optional(),
    utmSource: z.string().max(100).optional(),
    utmMedium: z.string().max(100).optional(),
    utmCampaign: z.string().max(100).optional(),
    utmTerm: z.string().max(100).optional(),
    utmContent: z.string().max(100).optional(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']).optional(),
  })
  .strict();
export type AnalyticsStoredEventV1 = z.infer<typeof AnalyticsStoredEventV1Schema>;

export const AnalyticsIngestResponseSchema = z
  .object({ accepted: z.literal(true) })
  .strict();
export type AnalyticsIngestResponse = z.infer<typeof AnalyticsIngestResponseSchema>;

export const AnalyticsRangeQuerySchema = z
  .object({
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    'from must be before to',
  );
export type AnalyticsRangeQuery = z.infer<typeof AnalyticsRangeQuerySchema>;

export const AnalyticsRangeSchema = z
  .object({ from: timestampSchema, to: timestampSchema })
  .strict();
export type AnalyticsRange = z.infer<typeof AnalyticsRangeSchema>;

export const AnalyticsMetricsSchema = z
  .object({
    pageViews: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    conversionRate: z.number().finite().nonnegative(),
    ctaClicks: z.number().int().nonnegative(),
  })
  .strict();
export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;

export const AnalyticsTimeSeriesPointSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pageViews: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    conversionRate: z.number().finite().nonnegative(),
  })
  .strict();
export type AnalyticsTimeSeriesPoint = z.infer<typeof AnalyticsTimeSeriesPointSchema>;

export const AnalyticsBreakdownItemSchema = z
  .object({
    name: z.string().max(200),
    pageViews: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
  })
  .strict();
export type AnalyticsBreakdownItem = z.infer<typeof AnalyticsBreakdownItemSchema>;

export const AnalyticsPageSummarySchema = z
  .object({
    id: EntityIdSchema,
    name: nonEmptyText.max(200),
    siteName: nonEmptyText.max(200),
    siteSlug: analyticsSlugSchema,
    pagePath: PagePathSchema.optional(),
    slug: analyticsSlugSchema.optional(),
    metrics: AnalyticsMetricsSchema,
  })
  .strict();
export type AnalyticsPageSummary = z.infer<typeof AnalyticsPageSummarySchema>;

const analyticsReportShape = {
  range: AnalyticsRangeSchema,
  metrics: AnalyticsMetricsSchema,
  timeline: z.array(AnalyticsTimeSeriesPointSchema).max(367),
  topReferrers: z.array(AnalyticsBreakdownItemSchema).max(20),
  topCampaigns: z.array(AnalyticsBreakdownItemSchema).max(20),
  deviceBreakdown: z.array(AnalyticsBreakdownItemSchema).max(10),
} as const;

export const AnalyticsOverviewResponseSchema = z
  .object({
    ...analyticsReportShape,
    topPages: z.array(AnalyticsPageSummarySchema).max(50),
  })
  .strict();
export type AnalyticsOverviewResponse = z.infer<typeof AnalyticsOverviewResponseSchema>;

export const AnalyticsPageResponseSchema = z
  .object({
    ...analyticsReportShape,
    page: AnalyticsPageSummarySchema,
  })
  .strict();
export type AnalyticsPageResponse = z.infer<typeof AnalyticsPageResponseSchema>;

// Phase 7 integration contracts deliberately live outside PagePayloadV1/V2. A
// form references workspace configuration through FormIntegrationBinding so
// credentials and delivery policy never become page content.
export const IntegrationTypeSchema = z.enum(['email', 'webhook']);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const IntegrationDeliveryStatusSchema = z.enum([
  'pending',
  'processing',
  'delivered',
  'failed',
]);
export type IntegrationDeliveryStatus = z.infer<typeof IntegrationDeliveryStatusSchema>;

const integrationName = nonEmptyText.max(200);
const emailRecipientsSchema = z.array(z.string().email().max(320)).min(1).max(50);
const emailSubjectTemplateSchema = nonEmptyText.max(200);
const webhookEventTypeSchema = z.literal('form.submitted');
const webhookUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Webhook URL must be a valid HTTP(S) URL');

export const EmailIntegrationConfigInputSchema = z
  .object({
    recipients: emailRecipientsSchema,
    subjectTemplate: emailSubjectTemplateSchema,
  })
  .strict();
export type EmailIntegrationConfigInput = z.infer<
  typeof EmailIntegrationConfigInputSchema
>;

export const WebhookIntegrationConfigInputSchema = z
  .object({
    url: webhookUrlSchema,
    eventType: webhookEventTypeSchema,
  })
  .strict();
export type WebhookIntegrationConfigInput = z.infer<
  typeof WebhookIntegrationConfigInputSchema
>;

const integrationConfigInputSchema = z.union([
  EmailIntegrationConfigInputSchema,
  WebhookIntegrationConfigInputSchema,
]);

export const IntegrationConfigSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('email'),
      recipients: emailRecipientsSchema,
      subjectTemplate: emailSubjectTemplateSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('webhook'),
      url: webhookUrlSchema,
      eventType: webhookEventTypeSchema,
      secretConfigured: z.boolean(),
    })
    .strict(),
]);
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

export const IntegrationSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    name: integrationName,
    type: IntegrationTypeSchema,
    enabled: z.boolean(),
    config: IntegrationConfigSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Integration = z.infer<typeof IntegrationSchema>;

const integrationRequestBase = {
  name: integrationName,
  enabled: z.boolean().default(true),
  config: integrationConfigInputSchema,
  secret: z.string().min(1).max(2_048).optional(),
} as const;

function validateIntegrationConfigType(
  value: {
    type: IntegrationType;
    config: EmailIntegrationConfigInput | WebhookIntegrationConfigInput;
    secret?: string | undefined;
  },
  context: z.RefinementCtx,
): void {
  const isEmail = value.type === 'email' && 'recipients' in value.config;
  const isWebhook = value.type === 'webhook' && 'url' in value.config;
  if (!isEmail && !isWebhook) {
    context.addIssue({
      code: 'custom',
      message: 'Integration type does not match its configuration',
      path: ['config'],
    });
  }
  if (value.type === 'email' && value.secret !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Email integrations do not accept a workspace secret',
      path: ['secret'],
    });
  }
}

export const CreateIntegrationRequestSchema = z
  .object({
    type: IntegrationTypeSchema,
    ...integrationRequestBase,
  })
  .strict()
  .superRefine(validateIntegrationConfigType);
export type CreateIntegrationRequest = z.infer<typeof CreateIntegrationRequestSchema>;

export const UpdateIntegrationRequestSchema = z
  .object({
    name: integrationName.optional(),
    enabled: z.boolean().optional(),
    config: integrationConfigInputSchema.optional(),
    secret: z.string().min(1).max(2_048).optional(),
    clearSecret: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')
  .superRefine((value, context) => {
    if (value.clearSecret && value.secret !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Choose either a replacement secret or clearSecret',
        path: ['secret'],
      });
    }
    if (value.config && 'recipients' in value.config && value.secret !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Email integrations do not accept a workspace secret',
        path: ['secret'],
      });
    }
  });
export type UpdateIntegrationRequest = z.infer<typeof UpdateIntegrationRequestSchema>;

export const IntegrationListResponseSchema = z
  .object({ items: z.array(IntegrationSchema), pagination: PaginationSchema })
  .strict();
export type IntegrationListResponse = z.infer<typeof IntegrationListResponseSchema>;

export const FormIntegrationBindingSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    landingPageId: EntityIdSchema,
    formNodeId: pageNodeId,
    integrationIds: z.array(EntityIdSchema).max(50),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type FormIntegrationBinding = z.infer<typeof FormIntegrationBindingSchema>;

export const FormIntegrationBindingListResponseSchema = z
  .object({ items: z.array(FormIntegrationBindingSchema) })
  .strict();
export type FormIntegrationBindingListResponse = z.infer<
  typeof FormIntegrationBindingListResponseSchema
>;

export const UpdateFormIntegrationBindingRequestSchema = z
  .object({ integrationIds: z.array(EntityIdSchema).max(50) })
  .strict();
export type UpdateFormIntegrationBindingRequest = z.infer<
  typeof UpdateFormIntegrationBindingRequestSchema
>;

export const IntegrationDeliverySchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    submissionId: EntityIdSchema,
    integrationId: EntityIdSchema,
    integrationName,
    integrationType: IntegrationTypeSchema,
    status: IntegrationDeliveryStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    lastAttemptAt: timestampSchema.optional(),
    lastError: z.string().max(500).optional(),
    deliveredAt: timestampSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type IntegrationDelivery = z.infer<typeof IntegrationDeliverySchema>;

export const IntegrationDeliveryListQuerySchema = PaginationQuerySchema.extend({
  status: IntegrationDeliveryStatusSchema.optional(),
  integrationId: EntityIdSchema.optional(),
  submissionId: EntityIdSchema.optional(),
}).strict();
export type IntegrationDeliveryListQuery = z.infer<
  typeof IntegrationDeliveryListQuerySchema
>;

export const IntegrationDeliveryListResponseSchema = z
  .object({ items: z.array(IntegrationDeliverySchema), pagination: PaginationSchema })
  .strict();
export type IntegrationDeliveryListResponse = z.infer<
  typeof IntegrationDeliveryListResponseSchema
>;

export const FormSubmittedWebhookV1Schema = z
  .object({
    event: z.literal('form.submitted'),
    version: z.literal(1),
    submissionId: EntityIdSchema,
    landingPageId: EntityIdSchema,
    pagePath: PagePathSchema.optional(),
    pageSlug: analyticsSlugSchema.optional(),
    formId: pageNodeId,
    submittedAt: timestampSchema,
    data: z.record(z.string().max(128), submissionValueSchema),
  })
  .strict();
export type FormSubmittedWebhookV1 = z.infer<typeof FormSubmittedWebhookV1Schema>;
