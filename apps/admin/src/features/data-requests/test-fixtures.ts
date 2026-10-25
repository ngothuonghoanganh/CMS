import type { DataRequest, DataRequestDetail, DataRequestListResponse } from '@plp/contracts';
import { SITE_ID } from '../dashboard/test-fixtures';

// Shared by the data request specs only.

export { SITE_ID };
export const REQUEST_ID = '64b000000000000000000501';
export const OTHER_REQUEST_ID = '64b000000000000000000502';
export const OWNER = { id: '64b000000000000000000001', name: 'Ngọc Anh' };

/** "Lê Mai Anh" asked on Friday 23/10/2026 at 10:15 to delete her data (board 12). */
export function dataRequest(overrides: Partial<DataRequest> = {}): DataRequest {
  return {
    id: REQUEST_ID,
    contact: { name: 'Lê Mai Anh', phone: '+84987106223', email: null },
    masked: false,
    type: 'delete',
    status: 'open',
    receivedAt: '2026-10-23T03:15:00.000Z',
    respondBy: '2026-10-27T16:59:59.999Z',
    completeBy: '2026-11-20T16:59:59.999Z',
    respondedAt: null,
    completedAt: null,
    leads: { count: 1, capped: false },
    completedCount: null,
    createdAt: '2026-10-23T03:20:00.000Z',
    ...overrides,
  };
}

export function dataRequestDetail(overrides: Partial<DataRequestDetail> = {}): DataRequestDetail {
  return {
    ...dataRequest(),
    log: [{ at: '2026-10-23T03:20:00.000Z', actor: OWNER, action: 'created', count: null }],
    matches: [
      {
        id: '64b000000000000000000401',
        name: 'Lê Mai Anh',
        phone: '+84987106223',
        email: null,
        page: { id: '64b000000000000000000101', title: 'Ưu đãi niềng răng tháng 11' },
        createdAt: '2026-10-20T02:00:00.000Z',
        marketing: true,
        marketingWithdrawnAt: null,
      },
    ],
    ...overrides,
  };
}

export function dataRequestList(
  items: DataRequest[],
  nextCursor: string | null = null,
): DataRequestListResponse {
  return { items, nextCursor };
}
