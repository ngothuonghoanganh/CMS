import { describe, expect, it } from 'vitest';
import {
  CONSENT_REQUIRED_MESSAGE,
  LEAD_PHONE_MESSAGE,
  leadPhoneSchema,
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
    ['0901 234 567', '0901234567'],
    ['0901.234.567', '0901234567'],
    ['090-123-4567', '0901234567'],
    ['+84 901 234 567', '0901234567'],
  ])('accepts %j as %j', (input, stored) => {
    expect(leadPhoneSchema.parse(input)).toBe(stored);
  });

  it.each(['090123456', '1901234567', '+8490123456', '0901 234 56a', '+1 650 555 0100'])(
    'refuses %j with the message of board 09',
    (input) => {
      const result = leadPhoneSchema.safeParse(input);
      expect(result.error?.issues[0]?.message).toBe(LEAD_PHONE_MESSAGE);
    },
  );

  it('asks for a number when empty', () => {
    expect(leadPhoneSchema.safeParse('  ').error?.issues[0]?.message).toBe('Nhập số điện thoại');
  });
});

describe('publicLeadRequestSchema', () => {
  it('normalizes the fields', () => {
    expect(publicLeadRequestSchema.parse(request)).toMatchObject({
      name: 'Nguyễn Thu Hà',
      phone: '0901234567',
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
