import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
  type WorkflowNode,
} from '@payload/contracts';

export type WorkflowGraphIssue = {
  code:
    | 'TRIGGER_MISSING'
    | 'NODE_DUPLICATE'
    | 'NODE_ORPHAN'
    | 'EDGE_INVALID'
    | 'GRAPH_CYCLE'
    | 'BRANCH_INVALID'
    | 'UNSAFE_CONFIG';
  message: string;
  nodeId?: string;
  edgeId?: string;
};

const unsafeKeys = new Set([
  'code',
  'script',
  'javascript',
  'function',
  'module',
  'require',
  'eval',
  'newFunction',
]);

export function validateWorkflowGraph(input: unknown): {
  definition: WorkflowDefinition;
  issues: WorkflowGraphIssue[];
} {
  const graphInput =
    input && typeof input === 'object' && 'retryPolicy' in input
      ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'retryPolicy'))
      : input;
  const parsed = WorkflowDefinitionSchema.safeParse(graphInput);
  if (!parsed.success) {
    return {
      definition: input as WorkflowDefinition,
      issues: [
        {
          code: 'TRIGGER_MISSING',
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
        },
      ],
    };
  }

  const definition = parsed.data;
  const issues: WorkflowGraphIssue[] = [];
  if (!definition.trigger.type) {
    issues.push({ code: 'TRIGGER_MISSING', message: 'Workflow trigger is required' });
  }
  if (containsUnsafeKey(definition.trigger.config)) {
    issues.push({
      code: 'UNSAFE_CONFIG',
      message: 'Workflow trigger contains executable configuration',
    });
  }

  const byId = new Map<string, WorkflowNode>();
  const triggerNodes = definition.nodes.filter((node) => node.category === 'trigger');
  if (triggerNodes.length === 0) {
    issues.push({
      code: 'TRIGGER_MISSING',
      message: 'Workflow graph must contain a trigger node',
    });
  } else if (triggerNodes.length > 1) {
    issues.push({
      code: 'TRIGGER_MISSING',
      message: 'Workflow graph must contain exactly one trigger node',
    });
  } else if (triggerNodes[0]?.type !== definition.trigger.type) {
    issues.push({
      code: 'TRIGGER_MISSING',
      message: 'Trigger node type must match the workflow trigger',
      ...(triggerNodes[0] ? { nodeId: triggerNodes[0].id } : {}),
    });
  }
  for (const node of definition.nodes) {
    if (byId.has(node.id)) {
      issues.push({
        code: 'NODE_DUPLICATE',
        nodeId: node.id,
        message: `Node ${node.id} is declared more than once`,
      });
    }
    byId.set(node.id, node);
    if (containsUnsafeKey(node.config)) {
      issues.push({
        code: 'UNSAFE_CONFIG',
        nodeId: node.id,
        message: `Node ${node.id} contains executable configuration`,
      });
    }
  }

  const incoming = new Map<string, number>();
  const outgoing = new Map<
    string,
    Array<{ target: string; branch: string; edgeId: string }>
  >();
  for (const node of definition.nodes) incoming.set(node.id, 0);
  for (const edge of definition.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || edge.source === edge.target) {
      issues.push({
        code: 'EDGE_INVALID',
        edgeId: edge.id,
        message: `Edge ${edge.id} references an invalid node`,
      });
      continue;
    }
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const edges = outgoing.get(edge.source) ?? [];
    if (edges.some((candidate) => candidate.branch === edge.branch)) {
      issues.push({
        code: 'BRANCH_INVALID',
        edgeId: edge.id,
        nodeId: edge.source,
        message: `Node ${edge.source} has duplicate ${edge.branch} branches`,
      });
    }
    edges.push({ target: edge.target, branch: edge.branch, edgeId: edge.id });
    outgoing.set(edge.source, edges);
    if (source.category !== 'condition' && edge.branch !== 'always') {
      issues.push({
        code: 'BRANCH_INVALID',
        edgeId: edge.id,
        nodeId: edge.source,
        message: `Only condition nodes can use ${edge.branch} branches`,
      });
    }
  }

  for (const node of definition.nodes) {
    if ((incoming.get(node.id) ?? 0) === 0 && node.category !== 'trigger') {
      issues.push({
        code: 'NODE_ORPHAN',
        nodeId: node.id,
        message: `Node ${node.id} is not reachable from the workflow trigger`,
      });
    }
  }

  for (const [sourceId, edges] of outgoing) {
    const node = byId.get(sourceId);
    if (node?.category === 'condition' && edges.length > 0) {
      const branches = new Set(edges.map((edge) => edge.branch));
      const hasExplicitBranch = branches.has('true') || branches.has('false');
      if (hasExplicitBranch && (!branches.has('true') || !branches.has('false'))) {
        issues.push({
          code: 'BRANCH_INVALID',
          nodeId: sourceId,
          message: `Condition node ${sourceId} must define both true and false branches`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issues.push({
        code: 'GRAPH_CYCLE',
        nodeId: id,
        message: `Workflow graph contains a cycle at ${id}`,
      });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of outgoing.get(id) ?? []) visit(edge.target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of definition.nodes) visit(node.id);

  return { definition, issues: deduplicateIssues(issues) };
}

function containsUnsafeKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsUnsafeKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) => unsafeKeys.has(key.toLowerCase()) || containsUnsafeKey(child),
  );
}

function deduplicateIssues(issues: WorkflowGraphIssue[]): WorkflowGraphIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.nodeId ?? ''}:${issue.edgeId ?? ''}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
