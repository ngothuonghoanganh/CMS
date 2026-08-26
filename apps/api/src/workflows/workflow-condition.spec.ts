import { describe, expect, it } from 'vitest';

import { evaluateWorkflowExpression } from './workflow-condition';

const literal = (value: string | number | boolean | null) => ({
  kind: 'literal' as const,
  value,
});
const binding = (path: string) => ({ kind: 'binding' as const, path });

describe('workflow conditions', () => {
  it('evaluates typed values and structured bindings', () => {
    expect(
      evaluateWorkflowExpression(
        {
          operator: 'greaterThan',
          left: binding('trigger.form.budget'),
          right: literal(10_000_000),
        },
        { trigger: { form: { budget: 12_000_000 } } },
      ),
    ).toBe(true);
    expect(
      evaluateWorkflowExpression(
        {
          operator: 'equals',
          left: binding('trigger.utm.source'),
          right: literal('facebook'),
        },
        { trigger: { utm: { source: 'facebook' } } },
      ),
    ).toBe(true);
  });

  it('supports contains, existence and boolean composition', () => {
    const context = { trigger: { tags: ['vip', 'paid'], email: 'a@example.com' } };
    expect(
      evaluateWorkflowExpression(
        { operator: 'contains', left: binding('trigger.tags'), right: literal('vip') },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateWorkflowExpression(
        { operator: 'exists', left: binding('trigger.email') },
        context,
      ),
    ).toBe(true);
    expect(
      evaluateWorkflowExpression(
        {
          operator: 'AND',
          operands: [
            { operator: 'exists', left: binding('trigger.email') },
            {
              operator: 'notEquals',
              left: binding('trigger.missing'),
              right: literal('x'),
            },
          ],
        },
        context,
      ),
    ).toBe(true);
  });
});
