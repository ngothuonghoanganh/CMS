import { describe, expect, it, vi } from 'vitest';

import { WorkflowPagePublishCompatibilityAdapter } from './page-publish-compatibility.adapter';

describe('WorkflowPagePublishCompatibilityAdapter', () => {
  it('delegates the narrow publish validation to WorkflowService', async () => {
    const workflows = {
      validatePagePublishDependencies: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = new WorkflowPagePublishCompatibilityAdapter(workflows as never);

    await adapter.validateBeforePublish('page-1', 'workspace-1');

    expect(workflows.validatePagePublishDependencies).toHaveBeenCalledWith(
      'page-1',
      'workspace-1',
    );
  });
});
