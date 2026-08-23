import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateSiteRequestSchema,
  PaginationQuerySchema,
  UpdateSiteRequestSchema,
  type CreateSiteRequest,
  type PaginationQuery,
  type UpdateSiteRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SiteService } from './site.service';

@Controller('workspaces/:workspaceId/sites')
@UseGuards(AuthenticationGuard)
export class SiteController {
  constructor(@Inject(SiteService) private readonly siteService: SiteService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateSiteRequestSchema)) input: CreateSiteRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.siteService.create(
      requireRequestedWorkspace(principal, workspaceId),
      input,
    );
  }

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.siteService.list(
      requireRequestedWorkspace(principal, workspaceId),
      query,
    );
  }

  @Get(':siteId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.siteService.getById(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
    );
  }

  @Patch(':siteId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('siteId') siteId: string,
    @Body(new ZodValidationPipe(UpdateSiteRequestSchema)) input: UpdateSiteRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.siteService.update(
      requireRequestedWorkspace(principal, workspaceId),
      siteId,
      input,
    );
  }
}
