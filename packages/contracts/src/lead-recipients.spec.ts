import { describe, expect, it } from 'vitest';
import { confirmLeadRecipientRequestSchema } from './lead-recipients.js';

const TOKEN = 'a'.repeat(43);
const SITE_ID = '64b000000000000000000001';

describe('confirmLeadRecipientRequestSchema', () => {
  it('takes the site the link names with its secret (ADR-025)', () => {
    expect(confirmLeadRecipientRequestSchema.parse({ siteId: SITE_ID, token: TOKEN })).toEqual({
      siteId: SITE_ID,
      token: TOKEN,
    });
  });

  it('refuses a link without its site or with a site that is not an id', () => {
    expect(confirmLeadRecipientRequestSchema.safeParse({ token: TOKEN }).success).toBe(false);
    expect(
      confirmLeadRecipientRequestSchema.safeParse({ siteId: 'smilecare', token: TOKEN }).success,
    ).toBe(false);
  });
});
