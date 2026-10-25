import { ApiError } from '../../lib/api-core';

/**
 * A sentence for a failed request: the server's Vietnamese problem text, or an explanation of a
 * network failure. Callers log unexpected errors themselves.
 */
export function problemMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  if (error instanceof TypeError) {
    return 'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.';
  }
  return 'Đã có lỗi không mong muốn. Hãy tải lại trang rồi thử lại.';
}

/** Logs errors that are not an expected API problem, so they are not silently lost. */
export function reportUnexpected(context: string, error: unknown): void {
  if (!(error instanceof ApiError)) {
    console.error(context, error);
  }
}
