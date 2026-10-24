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

const titleByStatus: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ',
  401: 'Bạn cần đăng nhập',
  403: 'Bạn không có quyền thực hiện thao tác này',
  404: 'Không tìm thấy',
  409: 'Dữ liệu đã thay đổi',
  413: 'Tệp quá lớn',
  415: 'Định dạng tệp không được hỗ trợ',
  422: 'Dữ liệu không hợp lệ',
  429: 'Bạn thao tác quá nhanh, hãy thử lại sau ít phút',
};

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
      this.logger.error({ err: exception, requestId, path: request.path }, 'Unhandled error');
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
    return { ...base, title: 'Đã có lỗi xảy ra, hãy thử lại', status: 500, code: 'internal' };
  }
}
