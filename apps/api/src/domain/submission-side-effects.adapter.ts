import { Inject, Injectable } from '@nestjs/common';
import type { PlatformEventMap } from '@payload/contracts';

import { UsageService } from '../billing/usage.service';
import {
  SUBMISSION_SIDE_EFFECTS_PORT,
  type SubmissionAnalyticsInput,
  type SubmissionSideEffectsPort,
} from '../shared/submission-side-effects-port';
import { EventBus } from '../extensions/event-bus';
import { AnalyticsService } from './analytics.service';
import { IntegrationDispatcher } from './integration-dispatcher';

/** Composition-root adapter for submission side effects. */
@Injectable()
export class SubmissionSideEffectsAdapter implements SubmissionSideEffectsPort {
  constructor(
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(IntegrationDispatcher)
    private readonly integrationDispatcher: IntegrationDispatcher,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(EventBus) private readonly events: EventBus,
  ) {}

  async incrementSubmissionUsage(tenantId: string, occurredAt: Date): Promise<void> {
    await this.usage.increment(tenantId, 'form_submissions_monthly', 1, occurredAt);
  }

  enqueueIntegration(submissionId: string, workspaceId: string): Promise<void> {
    return this.integrationDispatcher.enqueueForSubmission(submissionId, workspaceId);
  }

  recordAnalytics(input: SubmissionAnalyticsInput): Promise<void> {
    return this.analytics.recordSubmission(input);
  }

  publishFormSubmitted(event: PlatformEventMap['form.submitted']): Promise<void> {
    return this.events.publish('form.submitted', event);
  }

  publishLeadCreated(event: PlatformEventMap['lead.created']): Promise<void> {
    return this.events.publish('lead.created', event);
  }
}

export const SUBMISSION_SIDE_EFFECTS_PORT_PROVIDER = {
  provide: SUBMISSION_SIDE_EFFECTS_PORT,
  useExisting: SubmissionSideEffectsAdapter,
} as const;
