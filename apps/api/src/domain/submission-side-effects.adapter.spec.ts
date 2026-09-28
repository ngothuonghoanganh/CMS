import { describe, expect, it, vi } from 'vitest';

import type { UsageService } from '../billing/usage.service';
import type { EventBus } from '../extensions/event-bus';
import type { AnalyticsService } from './analytics.service';
import type { IntegrationDispatcher } from './integration-dispatcher';
import { SubmissionSideEffectsAdapter } from './submission-side-effects.adapter';

describe('SubmissionSideEffectsAdapter', () => {
  it('forwards submission-specific side effects to platform services', async () => {
    const usage = {
      increment: vi.fn().mockResolvedValue(undefined),
    } as unknown as UsageService;
    const integrationDispatcher = {
      enqueueForSubmission: vi.fn().mockResolvedValue(undefined),
    } as unknown as IntegrationDispatcher;
    const analytics = {
      recordSubmission: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnalyticsService;
    const events = {
      publish: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventBus;
    const adapter = new SubmissionSideEffectsAdapter(
      usage,
      integrationDispatcher,
      analytics,
      events,
    );
    const occurredAt = new Date('2026-09-28T00:00:00.000Z');
    const analyticsInput = {
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      landingPageId: 'page-1',
      pageVersionId: 'version-1',
      publishedVersionNumber: 3,
      submissionId: 'submission-1',
      submittedAt: occurredAt,
    };
    const formEvent = {
      tenantId: 'tenant-1',
      eventId: 'submission-1',
      submissionId: 'submission-1',
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      pageId: 'page-1',
      formNodeId: 'form-1',
      occurredAt: occurredAt.toISOString(),
    };
    const leadEvent = {
      tenantId: 'tenant-1',
      eventId: 'lead:submission-1',
      submissionId: 'submission-1',
      workspaceId: 'workspace-1',
      occurredAt: occurredAt.toISOString(),
    };

    await adapter.incrementSubmissionUsage('tenant-1', occurredAt);
    await adapter.enqueueIntegration('submission-1', 'workspace-1');
    await adapter.recordAnalytics(analyticsInput);
    await adapter.publishFormSubmitted(formEvent);
    await adapter.publishLeadCreated(leadEvent);

    expect(usage.increment).toHaveBeenCalledWith(
      'tenant-1',
      'form_submissions_monthly',
      1,
      occurredAt,
    );
    expect(integrationDispatcher.enqueueForSubmission).toHaveBeenCalledWith(
      'submission-1',
      'workspace-1',
    );
    expect(analytics.recordSubmission).toHaveBeenCalledWith(analyticsInput);
    expect(events.publish).toHaveBeenNthCalledWith(1, 'form.submitted', formEvent);
    expect(events.publish).toHaveBeenNthCalledWith(2, 'lead.created', leadEvent);
  });
});
