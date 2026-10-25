import { describe, expect, it } from 'vitest';
import {
  CONSENT_REQUIRED_MESSAGE,
  formatLeadPhone,
  LEAD_PHONE_MESSAGE,
  leadPhoneSchema,
  normalizeLeadPhone,
  publicLeadRequestSchema,
} from './lead.js';
import { rendererSignaturePayload } from './public.js';

const request = {
  releaseId: '64b0000000000000000000a1',
  submissionId: '3f1c2a9e-7b5d-4e8f-9a01-6c2d3e4f5a6b',
  name: ' Nguyễn Thu Hà ',
  phone: '0901 234 567',
  email: ' Thuha@Example.com ',
  message: '',
  consent: true,
  marketing: false,
  honeypot: '',
  elapsedMs: 12_000,
  source: { utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: null, referrer: null },
};

describe('leadPhoneSchema', () => {
  it.each([
    ['0901 234 567', '+84901234567'],
    ['0901.234.567', '+84901234567'],
    ['090-123-4567', '+84901234567'],
    ['(028) 3822 1234', '+842838221234'],
    ['+84 901 234 567', '+84901234567'],
    ['+84 0901 234 567', '+84901234567'],
    ['84 901 234 567', '+84901234567'],
    ['0084 901 234 567', '+84901234567'],
    ['+1 650 555 0100', '+16505550100'],
    ['+65 6123 4567', '+6561234567'],
  ])('stores %j as %j, Vietnam by default', (input, stored) => {
    expect(leadPhoneSchema.parse(input)).toBe(stored);
  });

  it.each([
    '090123456',
    '1901234567',
    '+8490123456',
    '0901 234 56a',
    '650 555 0100',
    '+0123456789',
  ])('refuses %j with a message that shows both forms', (input) => {
    const result = leadPhoneSchema.safeParse(input);
    expect(result.error?.issues[0]?.message).toBe(LEAD_PHONE_MESSAGE);
  });

  it('asks for a number when empty', () => {
    expect(leadPhoneSchema.safeParse('  ').error?.issues[0]?.message).toBe('Nhập số điện thoại');
  });

  it('exposes the same rule for code that only needs the number', () => {
    expect(normalizeLeadPhone('0901 234 567')).toBe('+84901234567');
    expect(normalizeLeadPhone('0901')).toBeNull();
  });
});

describe('formatLeadPhone', () => {
  it.each([
    ['+84901234567', '0901 234 567'],
    ['+842838221234', '028 3822 1234'],
    ['+16505550100', '+16505550100'],
    ['+6561234567', '+6561234567'],
  ])('writes %j as %j', (stored, shown) => {
    expect(formatLeadPhone(stored)).toBe(shown);
  });

  it('reads back what the schema stores', () => {
    expect(formatLeadPhone(leadPhoneSchema.parse('+84 0901 234 567'))).toBe('0901 234 567');
  });
});

describe('publicLeadRequestSchema', () => {
  it('normalizes the fields', () => {
    expect(publicLeadRequestSchema.parse(request)).toMatchObject({
      name: 'Nguyễn Thu Hà',
      phone: '+84901234567',
      email: 'thuha@example.com',
      message: null,
    });
  });

  it('leaves an empty email out', () => {
    expect(publicLeadRequestSchema.parse({ ...request, email: ' ' }).email).toBeNull();
  });

  it('refuses a lead without the required consent', () => {
    const result = publicLeadRequestSchema.safeParse({ ...request, consent: false });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['consent'], message: CONSENT_REQUIRED_MESSAGE }),
    ]);
  });

  it('refuses a malformed submission id', () => {
    expect(publicLeadRequestSchema.safeParse({ ...request, submissionId: 'short' }).success).toBe(
      false,
    );
    expect(publicLeadRequestSchema.safeParse({ ...request, submissionId: null }).success).toBe(
      true,
    );
  });
});

describe('rendererSignaturePayload', () => {
  it('puts each signed field on its own line, the body last', () => {
    expect(
      rendererSignaturePayload({
        timestamp: '1792900000',
        method: 'post',
        path: '/public/sites/smilecare/leads',
        clientIp: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        body: '{"a":"b\nc"}',
      }),
    ).toBe(
      '1792900000\nPOST\n/public/sites/smilecare/leads\n203.0.113.7\nMozilla/5.0\n{"a":"b\nc"}',
    );
  });
});
