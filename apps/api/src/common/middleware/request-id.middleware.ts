import { randomUUID } from 'node:crypto';

import type { NextFunction, RequestHandler, Response } from 'express';

import type { PlatformRequest } from '../interfaces/request';

export const requestIdMiddleware: RequestHandler = (
  request: PlatformRequest,
  response: Response,
  next: NextFunction,
) => {
  const headerValue = request.header('x-request-id');
  const generatedId =
    'id' in request && typeof request.id === 'string' ? request.id : undefined;
  const requestId = headerValue?.trim() || generatedId || randomUUID();

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
};
