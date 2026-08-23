import { Injectable } from '@nestjs/common';

import { env } from '../../config/env';
import type {
  EmailMessage,
  EmailProvider,
  EmailProviderResult,
} from './integration.types';

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

@Injectable()
export class FakeEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    this.messages.push(message);
    return { kind: 'delivered' };
  }
}

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailProviderResult> {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      return {
        kind: 'permanent',
        error: 'Email provider is not configured',
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: message.recipients,
          subject: message.subject,
          text: message.text,
        }),
      });
      if (response.ok) return { kind: 'delivered' };
      if (response.status === 429 || response.status >= 500) {
        return {
          kind: 'retryable',
          error: `Email provider returned HTTP ${response.status}`,
        };
      }
      return {
        kind: 'permanent',
        error: `Email provider returned HTTP ${response.status}`,
      };
    } catch {
      return { kind: 'retryable', error: 'Email provider request failed' };
    }
  }
}

export function createEmailProvider(): EmailProvider {
  return env.INTEGRATION_EMAIL_PROVIDER === 'resend'
    ? new ResendEmailProvider()
    : new FakeEmailProvider();
}
