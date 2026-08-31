import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateReusableRequestSchema,
  PaginationQuerySchema,
  UpdateReusableRequestSchema,
  type CreateReusableRequest,
  type PaginationQuery,
  type UpdateReusableRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';
import { ReusableService } from './reusable.service';

@Controller('workspaces/:workspaceId/sites/:siteId/reusables')
@UseGuards(AuthenticationGuard)
export class ReusableController {
  constructor(
    @Inject(ReusableService) private readonly reusableService: ReusableService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(CreateReusableRequestSchema))
    input: CreateReusableRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'reusable.create', workspaceId);
    const result = await this.reusableService.create(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'reusable.create',
        resourceType: 'reusable',
        resourceId: result.id,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'reusable.read', workspaceId);
    return this.reusableService.list(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      query,
    );
  }

  @Get(':reusableId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('reusableId') reusableId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'reusable.read', workspaceId);
    return this.reusableService.getById(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      reusableId,
    );
  }

  @Patch(':reusableId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('reusableId') reusableId: string,
    @Body(new ZodValidationPipe(UpdateReusableRequestSchema))
    input: UpdateReusableRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'reusable.update', workspaceId);
    const result = await this.reusableService.update(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      reusableId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'reusable.update',
        resourceType: 'reusable',
        resourceId: reusableId,
        workspaceId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':reusableId/usage')
  async usage(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('reusableId') reusableId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'reusable.read', workspaceId);
    return this.reusableService.getUsage(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      reusableId,
    );
  }

  @Delete(':reusableId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Param('reusableId') reusableId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'reusable.delete', workspaceId);
    await this.reusableService.archive(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      reusableId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'reusable.archive',
        resourceType: 'reusable',
        resourceId: reusableId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
  }
}
