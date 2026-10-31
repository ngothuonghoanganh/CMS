import { describe, expect, it } from 'vitest';
import {
  CONSENT_REQUIRED_MESSAGE,
  formatLeadPhone,
  LEAD_PHONE_MESSAGE,
  LEAD_SPAM_MIN_FILL_MS,
  leadEmailSchema,
  leadMessageSchema,
  leadNameSchema,
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
    // A landline after +84, with or without the 0 kept from the national form.
    ['+84 28 3822 1234', '+842838221234'],
    ['+84 028 3822 1234', '+842838221234'],
    // 24 characters typed, the most taken.
    ['(+84) (0)901 - 234 - 567', '+84901234567'],
    // With a country code: 8 to 15 digits.
    ['+47 234 567', '+47234567'],
    ['+1 234 567 890 123 45', '+123456789012345'],
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
    // 0 then 11 digits, and 11 digits after +84.
    '090 1234 56789',
    '+84 9012 345 6789',
    // A valid number followed by something else.
    '0901 234 567a',
    '+84 901 234 567a',
    // 7 and 16 digits with a country code.
    '+1 234 567',
    '+1 234 567 890 123 456',
    // 25 characters typed.
    '(+84) (0) 901 - 234 - 567',
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

describe('the other fields of the form', () => {
  it('takes a name of up to 100 characters', () => {
    expect(leadNameSchema.parse(` ${'A'.repeat(100)} `)).toBe('A'.repeat(100));
    expect(leadNameSchema.safeParse('A'.repeat(101)).error?.issues[0]?.message).toBe(
      'Họ và tên tối đa 100 ký tự',
    );
  });

  it('takes an email of up to 254 characters', () => {
    // 242 + 12 characters.
    const longest = `${'a'.repeat(242)}@example.com`;
    expect(leadEmailSchema.parse(longest)).toBe(longest);
    expect(leadEmailSchema.safeParse(`a${longest}`).error?.issues[0]?.message).toBe(
      'Email quá dài',
    );
  });

  it('takes a message of up to 1000 characters, trimmed, and leaves an empty one out', () => {
    expect(leadMessageSchema.parse('  Gọi sau 18h  ')).toBe('Gọi sau 18h');
    expect(leadMessageSchema.parse('   ')).toBeNull();
    expect(leadMessageSchema.parse('a'.repeat(1000))).toHaveLength(1000);
    expect(leadMessageSchema.safeParse('a'.repeat(1001)).error?.issues[0]?.message).toBe(
      'Lời nhắn tối đa 1000 ký tự',
    );
  });

  it('flags as spam a form filled in under 3 seconds (ADR-016)', () => {
    expect(LEAD_SPAM_MIN_FILL_MS).toBe(3000);
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

describe('publicLeadRequestSchema limits', () => {
  const accepts = (changes: object): boolean =>
    publicLeadRequestSchema.safeParse({ ...request, ...changes }).success;

  it('takes a fill time from 0 to 24 hours in whole milliseconds, or none without script', () => {
    expect(accepts({ elapsedMs: 0 })).toBe(true);
    expect(accepts({ elapsedMs: 86_400_000 })).toBe(true);
    expect(accepts({ elapsedMs: null })).toBe(true);
    expect(accepts({ elapsedMs: 86_400_001 })).toBe(false);
    expect(accepts({ elapsedMs: -1 })).toBe(false);
    expect(accepts({ elapsedMs: 1.5 })).toBe(false);
  });

  it('takes a submission id of 16 to 64 letters, digits and dashes', () => {
    expect(accepts({ submissionId: 'a'.repeat(16) })).toBe(true);
    expect(accepts({ submissionId: 'A1-'.repeat(21).concat('z') })).toBe(true);
    expect(accepts({ submissionId: 'a'.repeat(15) })).toBe(false);
    expect(accepts({ submissionId: 'a'.repeat(65) })).toBe(false);
    expect(accepts({ submissionId: '3f1c2a9e_7b5d_4e8f' })).toBe(false);
    expect(accepts({ submissionId: `${'a'.repeat(16)}!` })).toBe(false);
    expect(accepts({ submissionId: `!${'a'.repeat(16)}` })).toBe(false);
  });

  it('takes source values of up to 2000 characters and a honeypot of up to 500', () => {
    const source = (utmSource: string) => ({ source: { ...request.source, utmSource } });
    expect(accepts(source('a'.repeat(2000)))).toBe(true);
    expect(accepts(source('a'.repeat(2001)))).toBe(false);
    expect(accepts({ honeypot: 'a'.repeat(500) })).toBe(true);
    expect(accepts({ honeypot: 'a'.repeat(501) })).toBe(false);
  });

  it('needs a release id and the marketing choice', () => {
    expect(accepts({ releaseId: 'not-a-release' })).toBe(false);
    expect(accepts({ marketing: undefined })).toBe(false);
    expect(accepts({ marketing: true })).toBe(true);
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
