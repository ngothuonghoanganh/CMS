import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { signWebhookPayload } from './webhook.adapter';

describe('webhook signing', () => {
  it('signs timestamp + raw body with HMAC-SHA256 deterministically', () => {
    const secret = 'test-secret';
    const timestamp = '1700000000';
    const rawBody = '{"event":"form.submitted"}';
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    expect(signWebhookPayload(secret, timestamp, rawBody)).toBe(expected);
  });
});
