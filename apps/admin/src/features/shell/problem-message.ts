import { ApiError } from '../../lib/api-core';

/**
 * Issue codes of zod's own rules: their message may be zod's English default. The API's own
 * checks (`validationFailed`) and refinements use other codes, with Vietnamese messages.
 */
const ZOD_RULE_CODES = new Set([
  'invalid_type',
  'too_big',
  'too_small',
  'invalid_format',
  'not_multiple_of',
  'unrecognized_keys',
  'invalid_union',
  'invalid_key',
  'invalid_element',
  'invalid_value',
]);

/**
 * A sentence for a failed request: the server's Vietnamese problem text, or an explanation of a
 * network failure. Callers log unexpected errors themselves.
 */
export function problemMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // A field the API refused says what is wrong with it; "Dữ liệu không hợp lệ" alone does not.
    const issue = error.problem.issues?.find((item) => !ZOD_RULE_CODES.has(item.code));
    return issue?.message ?? error.problem.detail ?? error.problem.title;
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
