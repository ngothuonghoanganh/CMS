import type {
  FormSubmittedWebhookV1,
  IntegrationDeliveryStatus,
  PagePath,
} from '@payload/contracts';

import type { IntegrationDocument } from '../../persistence/schemas/integration.schema';

export type DeliveryField = {
  fieldId: string;
  label: string;
  name: string;
  type: string;
  value: string | boolean;
};

export type DeliverySubmissionContext = {
  submissionId: string;
  landingPageId: string;
  pageName: string;
  pagePath?: PagePath;
  pageSlug?: string;
  formNodeId: string;
  submittedAt: Date;
  fields: DeliveryField[];
};

export type IntegrationDeliveryContext = {
  integration: IntegrationDocument;
  submission: DeliverySubmissionContext;
  secret?: string;
};

export type DeliveryOutcome =
  | { kind: 'delivered' }
  | { kind: 'retryable'; error: string }
  | { kind: 'permanent'; error: string };

export interface IntegrationAdapter {
  readonly type: 'email' | 'webhook';
  deliver(context: IntegrationDeliveryContext): Promise<DeliveryOutcome>;
}

export type EmailMessage = {
  recipients: string[];
  subject: string;
  text: string;
};

export type EmailProviderResult =
  | { kind: 'delivered' }
  | { kind: 'retryable'; error: string }
  | { kind: 'permanent'; error: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailProviderResult>;
}

export type DeliveryRecordStatus = IntegrationDeliveryStatus;

export type FormSubmittedWebhookPayload = FormSubmittedWebhookV1;
