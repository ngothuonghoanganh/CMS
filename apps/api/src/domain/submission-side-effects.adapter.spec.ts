import { describe, expect, it, vi } from 'vitest';

import { TenantContext } from '../tenancy/tenant-context';
import { CoreEventBus } from '../shared/events/core-event-bus';
import type { SubmissionSideEffectsPort } from '../shared/submission-side-effects-port';
import { SubmissionSideEffectsSubscriber } from './submission-side-effects.adapter';

function createTenantContext(): TenantContext {
  const context = new TenantContext();
  context.enter({
    id: 'tenant-a',
    slug: 'tenant-a',
    name: 'Tenant A',
    status: 'active',
    databaseKey: 'mongo:tenant-a',
    databaseName: 'tenant-a',
    schemaVersion: 1,
  });
  return context;
}

describe('SubmissionSideEffectsSubscriber', () => {
  it('does not make core submission events depend on optional subscribers', async () => {
    const sideEffects = {
      incrementSubmissionUsage: vi
        .fn()
        .mockRejectedValue(new Error('billing unavailable')),
      enqueueIntegration: vi.fn().mockRejectedValue(new Error('integration unavailable')),
      recordAnalytics: vi.fn().mockRejectedValue(new Error('analytics unavailable')),
      publishFormSubmitted: vi.fn().mockRejectedValue(new Error('extension unavailable')),
      publishLeadCreated: vi.fn().mockRejectedValue(new Error('extension unavailable')),
    } satisfies SubmissionSideEffectsPort;
    const events = new CoreEventBus(createTenantContext());
    const subscriber = new SubmissionSideEffectsSubscriber(events, sideEffects);
    subscriber.onModuleInit();

    await expect(
      events.publish('submission.created', {
        tenantId: 'tenant-a',
        submissionId: 'submission-1',
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        pageId: 'page-1',
        pageVersionId: 'version-1',
        formNodeId: 'form-1',
        publishedVersionNumber: 2,
        occurredAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(sideEffects.incrementSubmissionUsage).toHaveBeenCalledOnce();
    expect(sideEffects.enqueueIntegration).toHaveBeenCalledOnce();
    expect(sideEffects.recordAnalytics).toHaveBeenCalledOnce();
    expect(sideEffects.publishFormSubmitted).toHaveBeenCalledOnce();
    expect(sideEffects.publishLeadCreated).toHaveBeenCalledOnce();

    subscriber.onModuleDestroy();
  });
});
