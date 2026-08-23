import { z } from 'zod';

export const apiVersion = 'v1' as const;

export const EntityIdSchema = z.string().uuid();
export type EntityId = z.infer<typeof EntityIdSchema>;

const timestampSchema = z.string().datetime({ offset: true });

export const AuthPrincipalSchema = z.object({
  subject: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  workspaceId: EntityIdSchema.optional(),
});

export type AuthPrincipal = z.infer<typeof AuthPrincipalSchema>;

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().uuid().optional(),
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

const nonEmptyText = z.string().trim().min(1);
const styleValue = z.string().trim().min(1).max(PAGE_PAYLOAD_MAX_STYLE_VALUE_LENGTH);
const pageNodeId = z
  .string()
  .regex(new RegExp(`^[A-Za-z][A-Za-z0-9_-]{0,${PAGE_PAYLOAD_MAX_NODE_ID_LENGTH - 1}}$`));

function isRelativePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
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

const StyleBlockSchema = z
  .object({
    display: z
      .enum(['block', 'flex', 'grid', 'inline', 'inline-block', 'none'])
      .optional(),
    width: styleValue.optional(),
    maxWidth: styleValue.optional(),
    minHeight: styleValue.optional(),
    padding: styleValue.optional(),
    margin: styleValue.optional(),
    gap: styleValue.optional(),
    backgroundColor: styleValue.optional(),
    color: styleValue.optional(),
    fontSize: styleValue.optional(),
    fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    borderRadius: styleValue.optional(),
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

const pageNodeTypeToChildren: Record<PageNode['type'], readonly PageNode['type'][]> = {
  root: ['section', 'container'],
  section: ['container', 'text', 'image', 'button'],
  container: ['section', 'text', 'image', 'button'],
  text: [],
  image: [],
  button: [],
};

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

      const allowedChildren = pageNodeTypeToChildren[current.node.type];
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

const pageNodeV2TypeToChildren: Record<
  PageNodeV2['type'],
  readonly PageNodeV2['type'][]
> = {
  root: ['section', 'container'],
  section: ['container', 'text', 'image', 'button', 'form'],
  container: ['section', 'text', 'image', 'button', 'form'],
  text: [],
  image: [],
  button: [],
  form: [],
};

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
      const allowedChildren = pageNodeV2TypeToChildren[current.node.type];
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
export const PagePayloadSchema = z.discriminatedUnion('version', [
  PagePayloadV1Schema,
  PagePayloadV2Schema,
]);
export type PagePayload = z.infer<typeof PagePayloadSchema>;

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
    name: nonEmptyText.max(200),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const AuthUserSchema = z
  .object({
    subject: z.string().min(1),
    email: z.string().email(),
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

export const SiteSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    name: nonEmptyText.max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const LandingPageSchema = z
  .object({
    id: EntityIdSchema,
    workspaceId: EntityIdSchema,
    siteId: EntityIdSchema,
    name: nonEmptyText.max(200),
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
  })
  .strict();

const PublicPageSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict();

export const PublicLandingPageSchema = z
  .object({
    site: PublicSiteSchema,
    page: PublicPageSchema,
    payload: PagePayloadSchema,
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
export type LandingPage = z.infer<typeof LandingPageSchema>;
export type PublicLandingPage = z.infer<typeof PublicLandingPageSchema>;
export type PageVersion = z.infer<typeof PageVersionSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Template = z.infer<typeof TemplateSchema>;

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
  .object({ items: z.array(LandingPageSchema), pagination: PaginationSchema })
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
export const CreateSiteRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();
export const UpdateSiteRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  })
  .strict()
  .refine((request) => Object.keys(request).length > 0, 'At least one field is required');
export const CreatePageRequestSchema = z
  .object({
    name: nonEmptyText.max(200),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    payload: PagePayloadSchema,
  })
  .strict();
export const UpdatePageRequestSchema = z
  .object({
    name: nonEmptyText.max(200).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
    payload: PagePayloadSchema.optional(),
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

export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>;
export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;
export type CreatePageRequest = z.infer<typeof CreatePageRequestSchema>;
export type UpdatePageRequest = z.infer<typeof UpdatePageRequestSchema>;
export type CreatePageVersionRequest = z.infer<typeof CreatePageVersionRequestSchema>;
export type PublishPageRequest = z.infer<typeof PublishPageRequestSchema>;

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

export const AnalyticsEventV1Schema = z.discriminatedUnion('event', [
  z
    .object({
      version: z.literal(1),
      event: z.literal('page.viewed'),
      siteSlug: analyticsSlugSchema,
      pageSlug: analyticsSlugSchema,
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
      pageSlug: analyticsSlugSchema,
      nodeId: pageNodeId,
      sessionId: analyticsSessionIdSchema,
      occurredAt: timestampSchema.optional(),
      context: analyticsContextSchema.optional(),
    })
    .strict(),
]);
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
    formId: pageNodeId,
    submittedAt: timestampSchema,
    data: z.record(z.string().max(128), submissionValueSchema),
  })
  .strict();
export type FormSubmittedWebhookV1 = z.infer<typeof FormSubmittedWebhookV1Schema>;
