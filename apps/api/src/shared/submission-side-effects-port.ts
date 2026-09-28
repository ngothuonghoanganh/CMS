import type { PlatformEventMap } from '@payload/contracts';

export const SUBMISSION_SIDE_EFFECTS_PORT = Symbol('SUBMISSION_SIDE_EFFECTS_PORT');

export type SubmissionAnalyticsInput = {
  workspaceId: string;
  siteId: string;
  landingPageId: string;
  pageVersionId: string;
  publishedVersionNumber: number;
  submissionId: string;
  submittedAt: Date;
  sessionId?: string;
};

/**
 * Submission-specific side effects. The authoritative submission write stays
 * in the core service while optional platform work remains behind this port.
 */
export interface SubmissionSideEffectsPort {
  incrementSubmissionUsage(tenantId: string, occurredAt: Date): Promise<void>;

  enqueueIntegration(submissionId: string, workspaceId: string): Promise<void>;

  recordAnalytics(input: SubmissionAnalyticsInput): Promise<void>;

  publishFormSubmitted(event: PlatformEventMap['form.submitted']): Promise<void>;

  publishLeadCreated(event: PlatformEventMap['lead.created']): Promise<void>;
}
