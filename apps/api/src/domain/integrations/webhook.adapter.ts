import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  FormSubmittedWebhookV1Schema,
  WebhookIntegrationConfigInputSchema,
} from '@payload/contracts';

import { env } from '../../config/env';
import { postJsonWithRedirects } from './webhook-http';
import { WebhookSecurityError } from './webhook-security';
import type {
  DeliveryOutcome,
  IntegrationAdapter,
  IntegrationDeliveryContext,
} from './integration.types';

@Injectable()
export class WebhookIntegrationAdapter implements IntegrationAdapter {
  readonly type = 'webhook' as const;

  async deliver(context: IntegrationDeliveryContext): Promise<DeliveryOutcome> {
    const config = WebhookIntegrationConfigInputSchema.safeParse(
      context.integration.config,
    );
    if (!config.success) {
      return { kind: 'permanent', error: 'Invalid webhook integration configuration' };
    }

    const payload = FormSubmittedWebhookV1Schema.parse({
      event: 'form.submitted',
      version: 1,
      submissionId: context.submission.submissionId,
      landingPageId: context.submission.landingPageId,
      formId: context.submission.formNodeId,
      submittedAt: context.submission.submittedAt.toISOString(),
      data: Object.fromEntries(
        context.submission.fields.map((field) => [field.name, field.value]),
      ),
    });
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Payload-Event': payload.event,
      'X-Payload-Version': String(payload.version),
      'X-Payload-Timestamp': timestamp,
    };
    if (context.secret) {
      headers['X-Payload-Signature'] = `sha256=${signWebhookPayload(
        context.secret,
        timestamp,
        rawBody,
      )}`;
    }

    try {
      const response = await postJsonWithRedirects(config.data.url, rawBody, headers, {
        allowHttp: env.INTEGRATION_ALLOW_HTTP_WEBHOOKS,
        allowLocalNetwork: env.INTEGRATION_ALLOW_LOCAL_WEBHOOKS,
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { kind: 'delivered' };
      }
      if (response.statusCode === 429 || response.statusCode >= 500) {
        return {
          kind: 'retryable',
          error: `Webhook returned HTTP ${response.statusCode}`,
        };
      }
      return { kind: 'permanent', error: `Webhook returned HTTP ${response.statusCode}` };
    } catch (error) {
      if (error instanceof WebhookSecurityError) {
        return {
          kind: 'permanent',
          error: 'Webhook URL was rejected by security policy',
        };
      }
      return { kind: 'retryable', error: 'Webhook request failed' };
    }
  }
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
}
