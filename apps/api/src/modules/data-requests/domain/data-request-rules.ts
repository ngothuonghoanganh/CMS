import type { DataRequestStatus, DataRequestType } from '@plp/contracts';

/**
 * - `respond`: the person was answered (only once, while `open`).
 * - `export`: the file of a request to see the stored data.
 * - `complete`: the request was handled; deletion and withdrawal happen with it.
 */
export type DataRequestStep = 'respond' | 'export' | 'complete';

/** Why `step` cannot be taken on a request now, or null when it can. */
export function stepProblem(
  step: DataRequestStep,
  request: { type: DataRequestType; status: DataRequestStatus },
): string | null {
  if (request.status === 'completed') {
    return 'Yêu cầu này đã hoàn tất';
  }
  switch (step) {
    case 'respond':
      return request.status === 'open' ? null : 'Yêu cầu này đã được phản hồi';
    case 'export':
      return request.type === 'access' ? null : 'Chỉ yêu cầu xem dữ liệu mới có file xuất';
    case 'complete':
      return null;
  }
}
