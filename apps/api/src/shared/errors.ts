import type { ErrorCode, ProblemIssue } from '@plp/contracts';

export interface AppErrorOptions {
  detail?: string;
  issues?: ProblemIssue[];
  context?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * An expected, user-facing failure. The problem filter turns it into `application/problem+json`;
 * anything that is not an AppError (or a Nest HttpException) becomes a logged 500.
 */
export class AppError extends Error {
  readonly detail: string | undefined;
  readonly issues: ProblemIssue[] | undefined;
  readonly context: Record<string, unknown> | undefined;

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly title: string,
    options: AppErrorOptions = {},
  ) {
    super(title, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.detail = options.detail;
    this.issues = options.issues;
    this.context = options.context;
  }
}

export function notFound(title = 'Không tìm thấy'): AppError {
  return new AppError(404, 'not_found', title);
}

export function forbidden(title = 'Bạn không có quyền thực hiện thao tác này'): AppError {
  return new AppError(403, 'forbidden', title);
}

export function validationFailed(issues: ProblemIssue[], title = 'Dữ liệu không hợp lệ'): AppError {
  return new AppError(422, 'validation_failed', title, { issues });
}
