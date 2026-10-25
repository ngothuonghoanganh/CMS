import type { LeadDetail, LeadListItem, LeadListResponse } from '@plp/contracts';
import { SITE_ID } from '../dashboard/test-fixtures';

// Shared by the lead inbox specs only.

export { SITE_ID };
export const PAGE_ID = '64b000000000000000000101';
export const OTHER_PAGE_ID = '64b000000000000000000102';
export const LEAD_ID = '64b000000000000000000401';
export const OTHER_LEAD_ID = '64b000000000000000000402';

export const pageRefs = [
  { id: OTHER_PAGE_ID, title: 'Cấy ghép Implant' },
  { id: PAGE_ID, title: 'Ưu đãi niềng răng tháng 11' },
];

export function leadItem(overrides: Partial<LeadListItem> = {}): LeadListItem {
  return {
    id: LEAD_ID,
    name: 'Nguyễn Thu Hà',
    phone: '+84901234567',
    page: { id: PAGE_ID, title: 'Ưu đãi niềng răng tháng 11' },
    source: { source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' },
    status: 'new',
    createdAt: '2026-10-24T09:42:00.000Z',
    ...overrides,
  };
}

export function leadList(
  items: LeadListItem[],
  overrides: Partial<LeadListResponse> = {},
): LeadListResponse {
  return {
    items,
    nextCursor: null,
    counts: {
      inbox: { count: items.length, capped: false },
      spam: { count: 0, capped: false },
    },
    ...overrides,
  };
}

export function leadDetail(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: LEAD_ID,
    name: 'Nguyễn Thu Hà',
    phone: '+84901234567',
    email: 'thuha@example.com',
    message: 'Gọi sau 18h',
    page: { id: PAGE_ID, title: 'Ưu đãi niềng răng tháng 11' },
    releaseVersion: 12,
    source: { source: 'facebook', medium: 'cpc', campaign: 'uu-dai-t11' },
    device: 'mobile',
    status: 'new',
    note: '',
    spam: { suspected: false, reasons: [] },
    consent: {
      at: '2026-10-24T09:42:07.000Z',
      version: 2,
      controllerName: 'Công ty TNHH Nha khoa Smile Care',
      policyUrl: 'https://smilecare.vn/chinh-sach',
      requiredText:
        'Tôi đồng ý để Công ty TNHH Nha khoa Smile Care xử lý họ tên và số điện thoại của tôi.',
      marketingText: 'Nhận thông tin ưu đãi qua Zalo hoặc SMS (không bắt buộc)',
      marketing: false,
      marketingWithdrawnAt: null,
    },
    createdAt: '2026-10-24T09:42:00.000Z',
    expiresAt: '2027-10-24T09:42:00.000Z',
    personLeads: { count: 2, capped: false },
    ...overrides,
  };
}
