import { describe, expect, it } from 'vitest';

import { sanitizeAuditValue } from './audit.service';

describe('audit sanitization', () => {
  it('redacts secrets recursively while retaining safe metadata', () => {
    expect(
      sanitizeAuditValue({
        actor: 'user@example.com',
        password: 'never-store-this',
        nested: {
          accessToken: 'also-secret',
          count: 2,
        },
        values: [{ apiKey: 'secret' }, 'safe'],
      }),
    ).toEqual({
      actor: 'user@example.com',
      password: '[REDACTED]',
      nested: {
        accessToken: '[REDACTED]',
        count: 2,
      },
      values: [{ apiKey: '[REDACTED]' }, 'safe'],
    });
  });
});
