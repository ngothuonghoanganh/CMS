import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ErrorCode, Problem } from '@plp/contracts';
import type { Request, Response } from 'express';
import { AppError } from './errors.js';
import { redactPreviewToken } from './log-redaction.js';

const codeByStatus: Record<number, ErrorCode> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'validation_failed',
  429: 'rate_limited',
};

const BAD_REQUEST_TITLE = 'Yêu cầu không hợp lệ';

const titleByStatus: Record<number, string> = {
  400: BAD_REQUEST_TITLE,
  401: 'Bạn cần đăng nhập',
  403: 'Bạn không có quyền thực hiện thao tác này',
  404: 'Không tìm thấy',
  409: 'Dữ liệu đã thay đổi',
  413: 'Tệp quá lớn',
  415: 'Định dạng tệp không được hỗ trợ',
  422: 'Dữ liệu không hợp lệ',
  429: 'Bạn thao tác quá nhanh, hãy thử lại sau ít phút',
};

/** A JSON body larger than the parser's limit, which is not an uploaded file. */
const BODY_TOO_LARGE_TITLE = 'Dữ liệu gửi lên quá lớn';

/**
 * The status of a client error raised by Express's body parser before any route ran: a body over
 * the limit (`entity.too.large`, 413), malformed JSON (`entity.parse.failed`, 400) or an
 * unsupported charset (415). They are http-errors that carry a body-parser `type`.
 */
function bodyParserStatus(exception: unknown): number | null {
  if (!(exception instanceof Error) || !('type' in exception) || !('status' in exception)) {
    return null;
  }
  const { type, status } = exception;
  return typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500
    ? status
    : null;
}

/** Turns every error into RFC 9457 `application/problem+json`. Unexpected errors are logged as 500. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;
    const problem = this.toProblem(exception, requestId);
    if (problem.status >= 500) {
      // The path of a preview request is a signed token that shows the draft (ADR-010).
      this.logger.error(
        { err: exception, requestId, path: redactPreviewToken(request.path) },
        'Unhandled error',
      );
    }
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, requestId: string | undefined): Problem {
    const base = { type: 'about:blank', ...(requestId ? { requestId } : {}) };
    if (exception instanceof AppError) {
      return {
        ...base,
        title: exception.title,
        status: exception.status,
        code: exception.code,
        ...(exception.detail ? { detail: exception.detail } : {}),
        ...(exception.issues ? { issues: exception.issues } : {}),
        ...(exception.context ? { context: exception.context } : {}),
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        ...base,
        title: titleByStatus[status] ?? exception.message,
        status,
        code: codeByStatus[status] ?? (status >= 500 ? 'internal' : 'validation_failed'),
        detail: exception.message,
      };
    }
    const bodyStatus = bodyParserStatus(exception);
    if (bodyStatus !== null) {
      return {
        ...base,
        title:
          bodyStatus === 413
            ? BODY_TOO_LARGE_TITLE
            : (titleByStatus[bodyStatus] ?? BAD_REQUEST_TITLE),
        status: bodyStatus,
        code: codeByStatus[bodyStatus] ?? 'validation_failed',
      };
    }
    return { ...base, title: 'Đã có lỗi xảy ra, hãy thử lại', status: 500, code: 'internal' };
  }
}
