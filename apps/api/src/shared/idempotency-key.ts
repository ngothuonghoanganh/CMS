import { IDEMPOTENCY_KEY_HEADER, idempotencyKeySchema } from '@plp/contracts';
import { validationFailed } from './errors.js';
import { toProblemIssues } from './zod.pipe.js';

/**
 * The `Idempotency-Key` header of a request that must not run twice: publish (ADR-006) and
 * "Thanh toán lại" (ADR-035). Missing or malformed is a 422.
 */
export function parseIdempotencyKey(value: unknown): string {
  if (value === undefined) {
    throw validationFailed([
      {
        path: ['headers', IDEMPOTENCY_KEY_HEADER],
        code: 'required',
        message: 'Thiếu header Idempotency-Key',
      },
    ]);
  }
  const result = idempotencyKeySchema.safeParse(value);
  if (!result.success) {
    throw validationFailed(
      toProblemIssues(result.error).map((issue) => ({
        ...issue,
        path: ['headers', IDEMPOTENCY_KEY_HEADER, ...issue.path],
      })),
    );
  }
  return result.data;
}
