import { describe, expect, it } from 'vitest';

import { validateWorkflowGraph } from './workflow-graph';
import { referenceWorkflowDefinitions } from './reference-workflows';

const base = {
  trigger: { type: 'form.submitted', config: {} },
  nodes: [
    { id: 'trigger', type: 'form.submitted', category: 'trigger', config: {} },
    { id: 'condition', type: 'equals', category: 'condition', config: {} },
    { id: 'send', type: 'mail.send', category: 'action', config: {} },
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'condition', branch: 'always' },
    { id: 'e2', source: 'condition', target: 'send', branch: 'true' },
  ],
};

describe('workflow graph validation', () => {
  it('accepts a typed graph after schema normalization', () => {
    const result = validateWorkflowGraph({
      ...base,
      nodes: [
        ...base.nodes,
        { id: 'fallback', type: 'webhook.send', category: 'action', config: {} },
      ],
      edges: [
        ...base.edges,
        { id: 'e3', source: 'condition', target: 'fallback', branch: 'false' },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it('detects orphan nodes, invalid edges and cycles', () => {
    const result = validateWorkflowGraph({
      ...base,
      nodes: [
        ...base.nodes,
        { id: 'orphan', type: 'mail.send', category: 'action', config: {} },
      ],
      edges: [
        ...base.edges,
        { id: 'cycle', source: 'send', target: 'trigger', branch: 'always' },
      ],
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['NODE_ORPHAN', 'GRAPH_CYCLE', 'BRANCH_INVALID']),
    );
  });

  it('rejects executable configuration keys', () => {
    const result = validateWorkflowGraph({
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === 'send' ? { ...node, config: { script: 'alert(1)' } } : node,
      ),
    });
    expect(result.issues.some((issue) => issue.code === 'UNSAFE_CONFIG')).toBe(true);
  });

  it('requires one graph trigger matching the definition trigger', () => {
    const result = validateWorkflowGraph({
      ...base,
      trigger: { type: 'manual', config: { script: 'blocked' } },
      nodes: base.nodes.map((node) =>
        node.id === 'trigger' ? { ...node, type: 'form.submitted' } : node,
      ),
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['TRIGGER_MISSING', 'UNSAFE_CONFIG']),
    );
  });

  it('keeps the four reference definitions graph-safe', () => {
    for (const reference of referenceWorkflowDefinitions) {
      expect(validateWorkflowGraph(reference.definition).issues, reference.name).toEqual(
        [],
      );
    }
  });
});
