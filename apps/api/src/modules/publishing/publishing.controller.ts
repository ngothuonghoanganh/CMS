import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import {
  type ChecksResult,
  type CursorQuery,
  cursorQuerySchema,
  type HistoryResponse,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  type PointerMoveRequest,
  pointerMoveRequestSchema,
  type PointerMoveResponse,
  type PublishRequest,
  publishRequestSchema,
  type PublishResponse,
} from '@plp/contracts';
import type { Response } from 'express';
import { validationFailed } from '../../shared/errors.js';
import { toProblemIssues, ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PublishingService } from './publishing.service.js';

/** The `Idempotency-Key` header is required on publish; missing or malformed is a 422. */
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

@Controller()
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Get('pages/:pageId/checks')
  checks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
  ): Promise<ChecksResult> {
    return this.publishing.checks(user, pageId);
  }

  /** 201 with the new release; 200 with the same body when the idempotency key was used before. */
  @Post('pages/:pageId/releases')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: unknown,
    @Body(new ZodPipe(publishRequestSchema)) body: PublishRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublishResponse> {
    const key = parseIdempotencyKey(idempotencyKey);
    const outcome = await this.publishing.publish(user, pageId, key, body);
    response.status(outcome.replayed ? 200 : 201);
    return outcome.response;
  }

  @Get('pages/:pageId/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
    @Query(new ZodPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<HistoryResponse> {
    return this.publishing.history(user, pageId, query);
  }

  /** Rollback to a release of the page, or unpublish with `targetReleaseId: null`. */
  @Post('pages/:pageId/pointer')
  @HttpCode(200)
  movePointer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(pointerMoveRequestSchema)) body: PointerMoveRequest,
  ): Promise<PointerMoveResponse> {
    return this.publishing.movePointer(user, pageId, body);
  }

  @Post('activity/:activityId/undo')
  @HttpCode(200)
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('activityId') activityId: string,
  ): Promise<PointerMoveResponse> {
    return this.publishing.undo(user, activityId);
  }
}
