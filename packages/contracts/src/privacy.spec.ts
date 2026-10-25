import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_NAME_PLACEHOLDER,
  createConsentVersionRequestSchema,
  fillControllerName,
  SUGGESTED_REQUIRED_CONSENT_TEXT,
  updatePrivacyRequestSchema,
} from './privacy.js';

const validSettings = {
  controllerName: ' Công ty TNHH Nha khoa Smile Care ',
  requestEmail: ' DuLieu@SmileCare.vn ',
  policyUrl: 'https://smilecare.vn/chinh-sach',
  retentionMonths: 12,
};

describe('updatePrivacyRequestSchema', () => {
  it('trims the name and lowercases the request email', () => {
    expect(updatePrivacyRequestSchema.parse(validSettings)).toEqual({
      controllerName: 'Công ty TNHH Nha khoa Smile Care',
      requestEmail: 'dulieu@smilecare.vn',
      policyUrl: 'https://smilecare.vn/chinh-sach',
      retentionMonths: 12,
    });
  });

  it('clears an empty request email', () => {
    expect(updatePrivacyRequestSchema.parse({ ...validSettings, requestEmail: '  ' })).toEqual(
      expect.objectContaining({ requestEmail: null }),
    );
  });

  it('rejects an invalid request email', () => {
    const result = updatePrivacyRequestSchema.safeParse({
      ...validSettings,
      requestEmail: 'dulieu@',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['requestEmail']);
  });

  it.each(['', 'smilecare.vn/chinh-sach', 'javascript:alert(1)', 'ftp://smilecare.vn'])(
    'requires an http(s) policy link: %j',
    (policyUrl) => {
      const result = updatePrivacyRequestSchema.safeParse({ ...validSettings, policyUrl });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['policyUrl']);
    },
  );

  it('accepts 6, 12 and 24 months or no automatic deletion', () => {
    for (const retentionMonths of [6, 12, 24, null]) {
      expect(
        updatePrivacyRequestSchema.safeParse({ ...validSettings, retentionMonths }).success,
      ).toBe(true);
    }
    expect(
      updatePrivacyRequestSchema.safeParse({ ...validSettings, retentionMonths: 3 }).success,
    ).toBe(false);
  });

  it('requires a business name', () => {
    const result = updatePrivacyRequestSchema.safeParse({ ...validSettings, controllerName: ' ' });
    expect(result.error?.issues[0]?.message).toBe('Nhập tên doanh nghiệp');
  });
});

describe('createConsentVersionRequestSchema', () => {
  it('trims both texts', () => {
    expect(
      createConsentVersionRequestSchema.parse({
        baseVersion: 1,
        requiredText: ` ${SUGGESTED_REQUIRED_CONSENT_TEXT} `,
        marketingText: ' Nhận ưu đãi ',
      }),
    ).toEqual({
      baseVersion: 1,
      requiredText: SUGGESTED_REQUIRED_CONSENT_TEXT,
      marketingText: 'Nhận ưu đãi',
    });
  });

  it('allows a form without the marketing checkbox but not an empty marketing text', () => {
    const base = { baseVersion: 0, requiredText: 'Tôi đồng ý.' };
    expect(
      createConsentVersionRequestSchema.safeParse({ ...base, marketingText: null }).success,
    ).toBe(true);
    expect(
      createConsentVersionRequestSchema.safeParse({ ...base, marketingText: ' ' }).success,
    ).toBe(false);
  });

  it('limits the required text to 600 characters', () => {
    const result = createConsentVersionRequestSchema.safeParse({
      baseVersion: 0,
      requiredText: 'a'.repeat(601),
      marketingText: null,
    });
    expect(result.error?.issues[0]?.message).toBe('Tối đa 600 ký tự');
  });
});

describe('fillControllerName', () => {
  it('replaces every placeholder with the business name', () => {
    expect(
      fillControllerName(
        `${CONTROLLER_NAME_PLACEHOLDER} và đối tác của ${CONTROLLER_NAME_PLACEHOLDER}`,
        'Smile Care',
      ),
    ).toBe('Smile Care và đối tác của Smile Care');
  });

  it('writes a business name with dollar signs exactly as typed', () => {
    for (const name of ['Tiệm Nail $& Spa $$', "Kid$'s Corner", 'Café $` 24h', 'Giá $1']) {
      expect(fillControllerName(SUGGESTED_REQUIRED_CONSENT_TEXT, name)).toBe(
        `Tôi đồng ý để ${name} xử lý họ tên và số điện thoại của tôi nhằm liên hệ tư vấn dịch vụ.`,
      );
    }
  });

  it('leaves a text without the placeholder unchanged', () => {
    expect(fillControllerName('Tôi đồng ý.', 'Smile Care')).toBe('Tôi đồng ý.');
  });
});
