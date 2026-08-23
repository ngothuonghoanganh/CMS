import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SubmissionListQuerySchema,
  SubmitFormRequestSchema,
  UpdateSubmissionRequestSchema,
  type SubmissionListQuery,
  type SubmitFormRequest,
  type UpdateSubmissionRequest,
} from '@payload/contracts';
import type { Request } from 'express';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SubmissionService } from './submission.service';

@Controller('submissions')
@UseGuards(AuthenticationGuard)
export class SubmissionController {
  constructor(
    @Inject(SubmissionService) private readonly submissionService: SubmissionService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(SubmissionListQuerySchema)) query: SubmissionListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.submissionService.list(query, requireWorkspaceId(principal));
  }

  @Get(':submissionId')
  async get(
    @Param('submissionId') submissionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.submissionService.getById(submissionId, requireWorkspaceId(principal));
  }

  @Patch(':submissionId')
  async update(
    @Param('submissionId') submissionId: string,
    @Body(new ZodValidationPipe(UpdateSubmissionRequestSchema))
    input: UpdateSubmissionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.submissionService.updateStatus(
      submissionId,
      input,
      requireWorkspaceId(principal),
    );
  }
}

@Controller('public/sites')
export class PublicSubmissionController {
  constructor(
    @Inject(SubmissionService) private readonly submissionService: SubmissionService,
  ) {}

  @Post(':siteSlug/pages/:pageSlug/forms/:formNodeId/submissions')
  async submit(
    @Param('siteSlug') siteSlug: string,
    @Param('pageSlug') pageSlug: string,
    @Param('formNodeId') formNodeId: string,
    @Body(new ZodValidationPipe(SubmitFormRequestSchema)) input: SubmitFormRequest,
    @Req() request: Request,
  ) {
    return this.submissionService.submitPublic(
      siteSlug,
      pageSlug,
      formNodeId,
      input,
      request.ip || request.socket.remoteAddress || 'unknown',
    );
  }
}
