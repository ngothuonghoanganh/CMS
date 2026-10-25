import { describe, expect, it } from 'vitest';
import {
  currentLeadCapture,
  diffLeadCapture,
  type LeadCapture,
  type LeadCaptureSettings,
} from './lead-capture.js';

const settings: LeadCaptureSettings = {
  privacy: { controllerName: 'Nha khoa Smile Care', policyUrl: 'https://smilecare.vn/chinh-sach' },
  consent: {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    version: 2,
    requiredText: 'Tôi đồng ý để {Tên doanh nghiệp} liên hệ tư vấn.',
    marketingText: 'Nhận ưu đãi qua Zalo',
  },
};

const capture: LeadCapture = {
  consentVersionId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  consentVersion: 2,
  controllerName: 'Nha khoa Smile Care',
  policyUrl: 'https://smilecare.vn/chinh-sach',
  requiredText: 'Tôi đồng ý để Nha khoa Smile Care liên hệ tư vấn.',
  marketingText: 'Nhận ưu đãi qua Zalo',
};

describe('currentLeadCapture', () => {
  it('fills the business name into the consent text', () => {
    expect(currentLeadCapture(settings)).toEqual(capture);
  });

  it('is null until both the settings and a consent version exist', () => {
    expect(currentLeadCapture({ ...settings, privacy: null })).toBeNull();
    expect(currentLeadCapture({ ...settings, consent: null })).toBeNull();
  });
});

describe('diffLeadCapture', () => {
  it('lists each changed setting in a fixed order', () => {
    const next: LeadCapture = {
      ...capture,
      consentVersionId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      consentVersion: 3,
      policyUrl: 'https://smilecare.vn/bao-mat',
      controllerName: 'Smile Care',
    };
    expect(diffLeadCapture(capture, next).map((change) => change.label)).toEqual([
      'Dữ liệu cá nhân: nội dung đồng ý',
      'Dữ liệu cá nhân: tên doanh nghiệp',
      'Dữ liệu cá nhân: chính sách',
    ]);
    expect(diffLeadCapture(capture, next).every((change) => change.kind === 'privacy')).toBe(true);
  });

  it('reports a renamed business once, not also as a new consent text', () => {
    const renamed: LeadCapture = {
      ...capture,
      controllerName: 'Smile Care',
      requiredText: 'Tôi đồng ý để Smile Care liên hệ tư vấn.',
    };
    expect(diffLeadCapture(capture, renamed)).toEqual([
      { kind: 'privacy', label: 'Dữ liệu cá nhân: tên doanh nghiệp', sectionId: null },
    ]);
  });

  it('has nothing to compare when either side has no form', () => {
    expect(diffLeadCapture(null, capture)).toEqual([]);
    expect(diffLeadCapture(capture, null)).toEqual([]);
    expect(diffLeadCapture(capture, { ...capture })).toEqual([]);
  });
});
