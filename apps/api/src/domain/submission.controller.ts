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
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('submissions')
@UseGuards(AuthenticationGuard)
export class SubmissionController {
  constructor(
    @Inject(SubmissionService) private readonly submissionService: SubmissionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(SubmissionListQuerySchema)) query: SubmissionListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'lead.read');
    return this.submissionService.list(query, requireWorkspaceId(principal));
  }

  @Get(':submissionId')
  async get(
    @Param('submissionId') submissionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'lead.read');
    return this.submissionService.getById(submissionId, requireWorkspaceId(principal));
  }

  @Patch(':submissionId')
  async update(
    @Param('submissionId') submissionId: string,
    @Body(new ZodValidationPipe(UpdateSubmissionRequestSchema))
    input: UpdateSubmissionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'lead.update');
    const result = await this.submissionService.updateStatus(
      submissionId,
      input,
      requireWorkspaceId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'lead.update',
        resourceType: 'submission',
        resourceId: submissionId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata: { status: input.status },
      })
      .catch(() => undefined);
    return result;
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

  @Post(':siteSlug/forms/:formNodeId/submissions')
  async submitByPath(
    @Param('siteSlug') siteSlug: string,
    @Param('formNodeId') formNodeId: string,
    @Query('path') path = '/',
    @Body(new ZodValidationPipe(SubmitFormRequestSchema)) input: SubmitFormRequest,
    @Req() request: Request,
  ) {
    return this.submissionService.submitPublicByPath(
      siteSlug,
      path,
      formNodeId,
      input,
      request.ip || request.socket.remoteAddress || 'unknown',
    );
  }
}
