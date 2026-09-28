import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { PlatformEventMap } from '@payload/contracts';

import { UsageService } from '../billing/usage.service';
import {
  SUBMISSION_SIDE_EFFECTS_PORT,
  type SubmissionAnalyticsInput,
  type SubmissionSideEffectsPort,
} from '../shared/submission-side-effects-port';
import { CoreEventBus } from '../shared/events/core-event-bus';
import type { CoreEventMap } from '../shared/events/core-event-publisher';
import { EventBus } from '../extensions/event-bus';
import { AnalyticsService } from './analytics.service';
import { IntegrationDispatcher } from './integration-dispatcher';
import { platformLogger } from '../common/logging/platform-logger';

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

/**
 * Optional platform subscriber. SubmissionService publishes only the
 * core-owned event; this subscriber fans it out to billing, analytics,
 * integrations and the legacy extension event bus when those capabilities
 * are composed into the application.
 */
@Injectable()
export class SubmissionSideEffectsSubscriber implements OnModuleDestroy, OnModuleInit {
  private unsubscribe: (() => void) | undefined;

  constructor(
    @Inject(CoreEventBus) private readonly coreEvents: CoreEventBus,
    @Inject(SUBMISSION_SIDE_EFFECTS_PORT)
    private readonly sideEffects: SubmissionSideEffectsPort,
  ) {}

  onModuleInit(): void {
    this.unsubscribe ??= this.coreEvents.subscribe('submission.created', (event) =>
      this.handle(event),
    );
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async handle(event: CoreEventMap['submission.created']): Promise<void> {
    const submittedAt = new Date(event.occurredAt);
    const operations: Array<[string, () => Promise<void>]> = [
      [
        'billing usage',
        () => this.sideEffects.incrementSubmissionUsage(event.tenantId, submittedAt),
      ],
      [
        'integration enqueue',
        () => this.sideEffects.enqueueIntegration(event.submissionId, event.workspaceId),
      ],
      [
        'analytics conversion',
        () =>
          this.sideEffects.recordAnalytics({
            workspaceId: event.workspaceId,
            siteId: event.siteId,
            landingPageId: event.pageId,
            pageVersionId: event.pageVersionId,
            publishedVersionNumber: event.publishedVersionNumber,
            submissionId: event.submissionId,
            submittedAt,
            ...(event.sessionId ? { sessionId: event.sessionId } : {}),
          }),
      ],
      [
        'form.submitted event',
        () =>
          this.sideEffects.publishFormSubmitted({
            tenantId: event.tenantId,
            eventId: event.submissionId,
            submissionId: event.submissionId,
            workspaceId: event.workspaceId,
            siteId: event.siteId,
            pageId: event.pageId,
            formNodeId: event.formNodeId,
            occurredAt: event.occurredAt,
          }),
      ],
      [
        'lead.created event',
        () =>
          this.sideEffects.publishLeadCreated({
            tenantId: event.tenantId,
            eventId: `lead:${event.submissionId}`,
            submissionId: event.submissionId,
            workspaceId: event.workspaceId,
            occurredAt: event.occurredAt,
          }),
      ],
    ];

    await Promise.all(
      operations.map(async ([name, operation]) => {
        try {
          await operation();
        } catch (error) {
          platformLogger.warn(
            { err: error, event: name, submissionId: event.submissionId },
            'optional submission side effect failed',
          );
        }
      }),
    );
  }
}
