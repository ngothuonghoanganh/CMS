import { describe, expect, it } from 'vitest';

import {
  WorkflowActionRegistry,
  WorkflowConditionRegistry,
  WorkflowTriggerRegistry,
} from './workflow-registry';

describe('workflow registries', () => {
  it('registers and rejects duplicate extensible nodes', () => {
    const triggers = new WorkflowTriggerRegistry();
    triggers.register({
      type: 'custom.trigger',
      category: 'trigger',
      label: 'Custom Trigger',
    });
    expect(triggers.has('custom.trigger')).toBe(true);
    expect(() =>
      triggers.register({
        type: 'custom.trigger',
        category: 'trigger',
        label: 'Duplicate',
      }),
    ).toThrow('WORKFLOW_TRIGGER_DUPLICATE');
  });

  it('keeps condition and action providers separate', async () => {
    const conditions = new WorkflowConditionRegistry();
    const actions = new WorkflowActionRegistry();
    conditions.register({
      type: 'custom.condition',
      category: 'condition',
      label: 'Condition',
    });
    actions.register({
      type: 'custom.action',
      category: 'action',
      label: 'Action',
      execute: async () => ({ output: { ok: true } }),
    });
    expect(conditions.get('custom.action')).toBeUndefined();
    expect(await actions.get('custom.action')?.execute?.({} as never, {})).toEqual({
      output: { ok: true },
    });
  });
});
