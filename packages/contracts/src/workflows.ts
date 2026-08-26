import { z } from 'zod';

const workflowId = z.string().uuid();
const workflowKey = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const nodeId = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const boundedJsonObject = z.record(z.string().trim().min(1).max(120), z.unknown());

export const WorkflowScopeSchema = z.enum(['tenant', 'workspace', 'page']);
export type WorkflowScope = z.infer<typeof WorkflowScopeSchema>;
export const WorkflowStatusSchema = z.enum(['draft', 'published']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export const WorkflowNodeCategorySchema = z.enum([
  'trigger',
  'condition',
  'action',
  'control',
]);
export type WorkflowNodeCategory = z.infer<typeof WorkflowNodeCategorySchema>;
export const WorkflowBranchSchema = z.enum(['true', 'false', 'default', 'always']);
export type WorkflowBranch = z.infer<typeof WorkflowBranchSchema>;

export const WorkflowTriggerSchema = z
  .object({ type: workflowKey, config: boundedJsonObject.default({}) })
  .strict();
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

export const WorkflowLiteralSchema = z
  .object({
    kind: z.literal('literal'),
    value: z.union([z.string().max(20_000), z.number().finite(), z.boolean(), z.null()]),
    valueType: z.enum(['string', 'number', 'boolean', 'date', 'enum', 'null']).optional(),
  })
  .strict();
export const WorkflowBindingSchema = z
  .object({
    kind: z.literal('binding'),
    path: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .regex(/^[a-zA-Z0-9_$][a-zA-Z0-9_$.[\]-]*$/),
    valueType: z
      .enum(['string', 'number', 'boolean', 'date', 'enum', 'object'])
      .optional(),
  })
  .strict();
export const WorkflowValueSchema = z.union([
  WorkflowLiteralSchema,
  WorkflowBindingSchema,
]);
export type WorkflowValue = z.infer<typeof WorkflowValueSchema>;

export type WorkflowExpression = {
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'exists'
    | 'notExists'
    | 'greaterThan'
    | 'greaterThanOrEqual'
    | 'lessThan'
    | 'lessThanOrEqual'
    | 'AND'
    | 'OR'
    | 'NOT';
  left?: WorkflowValue | WorkflowExpression | undefined;
  right?: WorkflowValue | WorkflowExpression | undefined;
  operands?: Array<WorkflowValue | WorkflowExpression> | undefined;
};

export const WorkflowExpressionSchema: z.ZodType<WorkflowExpression> = z.lazy(() =>
  z
    .object({
      operator: z.enum([
        'equals',
        'notEquals',
        'contains',
        'notContains',
        'exists',
        'notExists',
        'greaterThan',
        'greaterThanOrEqual',
        'lessThan',
        'lessThanOrEqual',
        'AND',
        'OR',
        'NOT',
      ]),
      left: z.union([WorkflowValueSchema, WorkflowExpressionSchema]).optional(),
      right: z.union([WorkflowValueSchema, WorkflowExpressionSchema]).optional(),
      operands: z
        .array(z.union([WorkflowValueSchema, WorkflowExpressionSchema]))
        .max(20)
        .optional(),
    })
    .strict(),
);

export const WorkflowNodeSchema = z
  .object({
    id: nodeId,
    type: workflowKey,
    category: WorkflowNodeCategorySchema,
    config: boundedJsonObject.default({}),
    position: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .strict()
      .optional(),
    disabled: z.boolean().default(false),
  })
  .strict();
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export const WorkflowEdgeSchema = z
  .object({
    id: nodeId,
    source: nodeId,
    target: nodeId,
    branch: WorkflowBranchSchema.default('always'),
  })
  .strict();
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowDefinitionSchema = z
  .object({
    trigger: WorkflowTriggerSchema,
    nodes: z.array(WorkflowNodeSchema).min(1).max(200),
    edges: z.array(WorkflowEdgeSchema).max(400),
  })
  .strict();
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export const WorkflowRetryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10).default(3),
    initialDelayMs: z.number().int().min(0).max(86_400_000).default(0),
    backoffMultiplier: z.number().finite().min(1).max(10).default(2),
  })
  .strict();
export type WorkflowRetryPolicy = z.infer<typeof WorkflowRetryPolicySchema>;
export const WorkflowDefinitionVersionSchema = z
  .object({
    ...WorkflowDefinitionSchema.shape,
    retryPolicy: WorkflowRetryPolicySchema.default({
      maxAttempts: 3,
      initialDelayMs: 0,
      backoffMultiplier: 2,
    }),
  })
  .strict();
export type WorkflowDefinitionVersion = z.infer<typeof WorkflowDefinitionVersionSchema>;

export const WorkflowSchema = z
  .object({
    id: workflowId,
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000).optional(),
    scope: WorkflowScopeSchema,
    pageId: workflowId.optional(),
    workspaceId: workflowId.optional(),
    enabled: z.boolean(),
    draftVersionId: workflowId.optional(),
    publishedVersionId: workflowId.optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Workflow = z.infer<typeof WorkflowSchema>;
export const WorkflowVersionSchema = z
  .object({
    id: workflowId,
    workflowId,
    versionNumber: z.number().int().positive(),
    status: WorkflowStatusSchema,
    definition: WorkflowDefinitionVersionSchema,
    createdBy: z.string().trim().min(1).max(320).optional(),
    publishedAt: z.string().datetime({ offset: true }).optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type WorkflowVersion = z.infer<typeof WorkflowVersionSchema>;

export const CreateWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1_000).optional(),
    scope: WorkflowScopeSchema.default('page'),
    pageId: workflowId.optional(),
    workspaceId: workflowId.optional(),
    definition: WorkflowDefinitionVersionSchema.optional(),
  })
  .strict();
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequestSchema>;
export const UpdateWorkflowRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    definition: WorkflowDefinitionVersionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateWorkflowRequest = z.infer<typeof UpdateWorkflowRequestSchema>;

export const WorkflowExecutionStatusSchema = z.enum([
  'pending',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
]);
export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusSchema>;
export const WorkflowStepStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'skipped',
]);
export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatusSchema>;
export const SanitizedExecutionErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean().default(false),
  })
  .strict();
export type SanitizedExecutionError = z.infer<typeof SanitizedExecutionErrorSchema>;

export const WorkflowExecutionSchema = z
  .object({
    id: workflowId,
    workflowId,
    workflowVersionId: workflowId,
    workspaceId: workflowId.optional(),
    pageId: workflowId.optional(),
    status: WorkflowExecutionStatusSchema,
    triggerType: workflowKey,
    triggerEventId: z.string().trim().max(200).optional(),
    correlationId: z.string().trim().max(200).optional(),
    rootExecutionId: workflowId.optional(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    completedAt: z.string().datetime({ offset: true }).optional(),
    nextRunAt: z.string().datetime({ offset: true }).optional(),
    error: SanitizedExecutionErrorSchema.optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
export const WorkflowStepExecutionSchema = z
  .object({
    id: workflowId,
    executionId: workflowId,
    nodeId,
    status: WorkflowStepStatusSchema,
    attempt: z.number().int().nonnegative(),
    startedAt: z.string().datetime({ offset: true }).optional(),
    completedAt: z.string().datetime({ offset: true }).optional(),
    output: z.unknown().optional(),
    error: SanitizedExecutionErrorSchema.optional(),
  })
  .strict();
export type WorkflowStepExecution = z.infer<typeof WorkflowStepExecutionSchema>;

export const WorkflowListQuerySchema = z.object({
  scope: WorkflowScopeSchema.optional(),
  pageId: workflowId.optional(),
  workspaceId: workflowId.optional(),
  enabled: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type WorkflowListQuery = z.infer<typeof WorkflowListQuerySchema>;
export const WorkflowExecutionListQuerySchema = z.object({
  workflowId: workflowId.optional(),
  status: WorkflowExecutionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type WorkflowExecutionListQuery = z.infer<typeof WorkflowExecutionListQuerySchema>;
const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
});
export const WorkflowListResponseSchema = z
  .object({ items: z.array(WorkflowSchema), pagination: paginationSchema })
  .strict();
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>;
export const WorkflowExecutionListResponseSchema = z
  .object({ items: z.array(WorkflowExecutionSchema), pagination: paginationSchema })
  .strict();
export type WorkflowExecutionListResponse = z.infer<
  typeof WorkflowExecutionListResponseSchema
>;

export const WorkflowRegistryEntrySchema = z
  .object({
    type: workflowKey,
    category: WorkflowNodeCategorySchema,
    label: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).optional(),
    capability: workflowKey.optional(),
    extensionId: workflowKey.optional(),
    configSchema: z.unknown().optional(),
    outputSchema: z.unknown().optional(),
  })
  .strict();
export type WorkflowRegistryEntry = z.infer<typeof WorkflowRegistryEntrySchema>;
export const WorkflowRegistryResponseSchema = z
  .object({
    triggers: z.array(WorkflowRegistryEntrySchema),
    conditions: z.array(WorkflowRegistryEntrySchema),
    actions: z.array(WorkflowRegistryEntrySchema),
  })
  .strict();
export type WorkflowRegistryResponse = z.infer<typeof WorkflowRegistryResponseSchema>;

export const WorkflowRuntimeEventSchema = z
  .object({
    pageId: workflowId,
    pageVersionId: workflowId.optional(),
    type: z.enum(['page.viewed', 'button.clicked', 'form.started', 'section.viewed']),
    nodeId: nodeId.optional(),
    payload: boundedJsonObject.default({}),
    eventId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type WorkflowRuntimeEvent = z.infer<typeof WorkflowRuntimeEventSchema>;
export const WorkflowRetryRequestSchema = z.object({}).strict();
