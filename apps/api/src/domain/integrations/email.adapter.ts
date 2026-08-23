import { Injectable } from '@nestjs/common';
import {
  EmailIntegrationConfigInputSchema,
  type EmailIntegrationConfigInput,
} from '@payload/contracts';

import type {
  DeliveryOutcome,
  EmailProvider,
  IntegrationAdapter,
  IntegrationDeliveryContext,
} from './integration.types';

@Injectable()
export class EmailIntegrationAdapter implements IntegrationAdapter {
  readonly type = 'email' as const;

  constructor(private readonly provider: EmailProvider) {}

  async deliver(context: IntegrationDeliveryContext): Promise<DeliveryOutcome> {
    const parsed = EmailIntegrationConfigInputSchema.safeParse(
      context.integration.config,
    );
    if (!parsed.success)
      return { kind: 'permanent', error: 'Invalid email integration configuration' };
    const config = parsed.data;
    const message = {
      recipients: config.recipients,
      subject: renderSubject(config.subjectTemplate, context.submission.pageName),
      text: renderText(context.submission),
    };
    return this.provider.send(message);
  }
}

function renderSubject(template: string, pageTitle: string): string {
  return template
    .replaceAll('{{pageTitle}}', safeText(pageTitle))
    .replaceAll('{{formId}}', safeText('form'))
    .slice(0, 200);
}

function renderText(submission: IntegrationDeliveryContext['submission']): string {
  const lines = [
    'New form submission',
    '',
    `Landing page: ${safeText(submission.pageName)}`,
    `Form: ${safeText(submission.formNodeId)}`,
    `Submitted at: ${submission.submittedAt.toISOString()}`,
    '',
    ...submission.fields.map(
      (field) => `${safeText(field.label)}: ${safeText(String(field.value))}`,
    ),
  ];
  return lines.join('\n');
}

function safeText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

export function parseEmailConfig(value: unknown): EmailIntegrationConfigInput | null {
  const result = EmailIntegrationConfigInputSchema.safeParse(value);
  return result.success ? result.data : null;
}
