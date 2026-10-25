import { describe, expect, it } from 'vitest';
import {
  cappedCountLabel,
  consentMoment,
  leadDetailMeta,
  leadSourceLine,
  leadTimeLabel,
  newLeadsBadge,
  notificationView,
  telUrl,
  zaloUrl,
} from './lead-presentation';

// 16:42 on 24 October 2026 in Vietnam.
const NOW = '2026-10-24T09:42:00.000Z';

describe('lead presentation', () => {
  it('writes the time of today, "Hôm qua", then the day', () => {
    expect(leadTimeLabel('2026-10-24T02:10:00.000Z', NOW)).toBe('09:10');
    // 23:30 on 23 October in Vietnam.
    expect(leadTimeLabel('2026-10-23T16:30:00.000Z', NOW)).toBe('Hôm qua');
    // 00:30 on 24 October in Vietnam is today, though it is still the 23rd in UTC.
    expect(leadTimeLabel('2026-10-23T17:30:00.000Z', NOW)).toBe('00:30');
    expect(leadTimeLabel('2026-10-22T03:00:00.000Z', NOW)).toBe('22/10');
    expect(leadTimeLabel('2025-12-31T03:00:00.000Z', NOW)).toBe('31/12/2025');
  });

  it('describes when and from what device a lead came', () => {
    expect(leadDetailMeta({ createdAt: NOW, device: 'mobile' })).toBe(
      '24/10/2026 · 16:42 · từ điện thoại',
    );
    expect(leadDetailMeta({ createdAt: NOW, device: 'desktop' })).toBe(
      '24/10/2026 · 16:42 · từ máy tính',
    );
    expect(consentMoment('2026-10-24T09:42:07.000Z')).toBe('lúc 16:42:07');
  });

  it('writes the source with its campaign, and direct visits in words', () => {
    expect(leadSourceLine({ source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' })).toBe(
      'facebook / cpc / uu-dai-t11',
    );
    expect(leadSourceLine({ source: '(direct)', medium: '(none)', campaign: null })).toBe(
      'trực tiếp',
    );
  });

  it('calls any number and opens Zalo for Vietnamese numbers only', () => {
    expect(telUrl('+84901234567')).toBe('tel:+84901234567');
    expect(zaloUrl('+84901234567')).toBe('https://zalo.me/0901234567');
    expect(zaloUrl('+16505550100')).toBeNull();
  });

  it('caps counts at 999+ and hides the badge without new leads', () => {
    expect(cappedCountLabel({ count: 48, capped: false })).toBe('48');
    expect(cappedCountLabel({ count: 999, capped: true })).toBe('999+');
    expect(
      newLeadsBadge({ new: { count: 12, capped: false }, last7Days: { count: 48, capped: false } }),
    ).toBe('12 mới');
    expect(
      newLeadsBadge({ new: { count: 0, capped: false }, last7Days: { count: 3, capped: false } }),
    ).toBeNull();
  });
});

describe('notificationView', () => {
  const base = {
    status: 'sent' as const,
    attempts: 1,
    lastErrorCode: null,
    sentAt: '2026-10-24T09:42:09.000Z',
    recipients: 2,
  };

  it('says where a lead was emailed, or why not (ADR-018)', () => {
    expect(notificationView(base)).toEqual({
      kind: 'sent',
      text: 'Email thông báo · 2 người nhận',
      at: '2026-10-24T09:42:09.000Z',
    });
    expect(notificationView({ ...base, status: 'pending', attempts: 0, sentAt: null })).toEqual({
      kind: 'waiting',
      text: 'Đang gửi email thông báo',
    });
    expect(notificationView({ ...base, status: 'pending', attempts: 1, sentAt: null })).toEqual({
      kind: 'waiting',
      text: 'Đang thử gửi lại email thông báo (lần 2)',
    });
    expect(
      notificationView({ ...base, status: 'failed', lastErrorCode: 'no_recipients', sentAt: null }),
    ).toEqual({
      kind: 'failed',
      text: 'Lỗi đồng bộ · site chưa có email nhận lead nào đã xác nhận',
    });
    expect(notificationView({ ...base, status: 'skipped', sentAt: null })).toEqual({
      kind: 'skipped',
      text: 'Không gửi email: lead nghi ngờ spam',
    });
    expect(notificationView(null)).toBeNull();
  });
});
