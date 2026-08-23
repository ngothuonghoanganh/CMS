import { randomUUID } from 'node:crypto';

import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { ErrorResponse } from '@payload/contracts';

import { platformLogger } from '../logging/platform-logger';
import type { PlatformRequest } from '../interfaces/request';

type NestErrorBody = {
  code?: string;
  message?: string | string[];
  error?: string;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<PlatformRequest>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : this.isDuplicateKeyError(exception)
          ? 409
          : 500;
    const body = this.toErrorResponse(exception, status, requestId);

    if (status >= 500) {
      platformLogger.error({ err: exception, requestId }, 'request failed');
    }

    response.status(status).json(body);
  }

  private toErrorResponse(
    exception: unknown,
    status: number,
    requestId: string,
  ): ErrorResponse {
    if (this.isDuplicateKeyError(exception)) {
      return {
        error: {
          code: 'RESOURCE_CONFLICT',
          message: 'A resource with the same unique fields already exists',
          requestId,
        },
      };
    }

    if (!(exception instanceof HttpException) || status >= 500) {
      return {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
          requestId,
        },
      };
    }

    const exceptionBody = exception.getResponse();
    const message = this.readMessage(exceptionBody) ?? exception.message;
    const code = this.readCode(exceptionBody) ?? this.statusCodeToErrorCode(status);

    return {
      error: {
        code,
        message,
        requestId,
      },
    };
  }

  private readCode(body: string | object): string | undefined {
    if (!this.isNestErrorBody(body)) {
      return undefined;
    }

    return body.code;
  }

  private isDuplicateKeyError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as { code?: unknown }).code === 11000
    );
  }

  private readMessage(body: string | object): string | undefined {
    if (typeof body === 'string') {
      return body;
    }

    if (!this.isNestErrorBody(body)) {
      return undefined;
    }

    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }

    return body.message ?? body.error;
  }

  private isNestErrorBody(body: string | object): body is NestErrorBody {
    return typeof body === 'object' && body !== null;
  }

  private statusCodeToErrorCode(status: number): string {
    const knownCodes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
    };

    return knownCodes[status] ?? 'REQUEST_FAILED';
  }
}
