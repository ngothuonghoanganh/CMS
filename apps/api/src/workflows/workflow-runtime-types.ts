import type { WorkflowExecution } from '@payload/contracts';

export { WorkflowRegistryEntrySchema } from '@payload/contracts';
export type { WorkflowNodeCategory, WorkflowRegistryEntry } from '@payload/contracts';

export type WorkflowActionResult = {
  output?: unknown;
  waitUntil?: Date;
};

export type WorkflowExecutionContext = {
  tenantId: string;
  workflowId: string;
  workflowVersionId: string;
  executionId: string;
  pageId?: string;
  workspaceId?: string;
  trigger: Record<string, unknown>;
  variables: Record<string, unknown>;
  steps: Record<string, unknown>;
  execution: Pick<WorkflowExecution, 'id' | 'status' | 'triggerType'>;
  capabilities: {
    resolve: (
      capability: string,
      extensionId?: string,
    ) => { provider?: unknown } | undefined;
  };
  resolveConnection: (connectionId: string) => Promise<unknown>;
  logger: {
    info: (metadata: Record<string, unknown>, message: string) => void;
    warn: (metadata: Record<string, unknown>, message: string) => void;
  };
};
