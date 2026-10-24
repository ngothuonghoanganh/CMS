import { AppError } from '../../shared/errors.js';

/** 409 for a stale `baseRevision`, with the revision the client must reload (ADR-005). */
export function revisionConflict(currentRevision: number): AppError {
  return new AppError(409, 'revision_conflict', 'Bản nháp đã được thay đổi ở nơi khác', {
    detail: 'Tải lại trang để lấy bản nháp mới nhất trước khi sửa tiếp.',
    context: { currentRevision },
  });
}
