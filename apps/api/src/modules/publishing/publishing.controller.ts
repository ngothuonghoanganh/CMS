import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  type ApprovalResponse,
  type ChecksResult,
  type CursorQuery,
  cursorQuerySchema,
  type HistoryResponse,
  IDEMPOTENCY_KEY_HEADER,
  type PointerMoveRequest,
  pointerMoveRequestSchema,
  type PointerMoveResponse,
  type PublishRequest,
  publishRequestSchema,
  type PublishResponse,
  type RejectApproval,
  rejectApprovalSchema,
  type RequestApproval,
  requestApprovalSchema,
} from '@plp/contracts';
import type { Response } from 'express';
import { parseIdempotencyKey } from '../../shared/idempotency-key.js';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ApprovalsService } from './approvals.service.js';
import { PublishingService } from './publishing.service.js';

@Controller()
export class PublishingController {
  constructor(
    private readonly publishing: PublishingService,
    private readonly approvals: ApprovalsService,
  ) {}

  @Get('sites/:siteId/pages/:pageId/checks')
  checks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
  ): Promise<ChecksResult> {
    return this.publishing.checks(user, siteId, pageId);
  }

  /** 201 with the new release; 200 with the same body when the idempotency key was used before. */
  @Post('sites/:siteId/pages/:pageId/releases')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: unknown,
    @Body(new ZodPipe(publishRequestSchema)) body: PublishRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublishResponse> {
    const key = parseIdempotencyKey(idempotencyKey);
    const outcome = await this.publishing.publish(user, siteId, pageId, key, body);
    response.status(outcome.replayed ? 200 : 201);
    return outcome.response;
  }

  /** A request to publish the saved draft, or the sender's request sent again (ADR-023). */
  @Post('sites/:siteId/pages/:pageId/approval')
  @HttpCode(200)
  requestApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(requestApprovalSchema)) body: RequestApproval,
  ): Promise<ApprovalResponse> {
    return this.approvals.request(user, siteId, pageId, body);
  }

  @Delete('sites/:siteId/pages/:pageId/approval')
  withdrawApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
  ): Promise<ApprovalResponse> {
    return this.approvals.withdraw(user, siteId, pageId);
  }

  @Post('sites/:siteId/pages/:pageId/approval/reject')
  @HttpCode(200)
  rejectApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(rejectApprovalSchema)) body: RejectApproval,
  ): Promise<ApprovalResponse> {
    return this.approvals.reject(user, siteId, pageId, body);
  }

  @Get('sites/:siteId/pages/:pageId/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Query(new ZodPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<HistoryResponse> {
    return this.publishing.history(user, siteId, pageId, query);
  }

  /** Rollback to a release of the page, or unpublish with `targetReleaseId: null`. */
  @Post('sites/:siteId/pages/:pageId/pointer')
  @HttpCode(200)
  movePointer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('pageId') pageId: string,
    @Body(new ZodPipe(pointerMoveRequestSchema)) body: PointerMoveRequest,
  ): Promise<PointerMoveResponse> {
    return this.publishing.movePointer(user, siteId, pageId, body);
  }

  @Post('sites/:siteId/activity/:activityId/undo')
  @HttpCode(200)
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Param('activityId') activityId: string,
  ): Promise<PointerMoveResponse> {
    return this.publishing.undo(user, siteId, activityId);
  }
}
