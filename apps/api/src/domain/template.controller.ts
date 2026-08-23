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
  CreateTemplateRequestSchema,
  PaginationQuerySchema,
  UpdateTemplateRequestSchema,
  type CreateTemplateRequest,
  type PaginationQuery,
  type UpdateTemplateRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TemplateService } from './template.service';

@Controller('workspaces/:workspaceId/templates')
@UseGuards(AuthenticationGuard)
export class TemplateController {
  constructor(
    @Inject(TemplateService) private readonly templateService: TemplateService,
  ) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateTemplateRequestSchema))
    input: CreateTemplateRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.templateService.create(
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
    return this.templateService.list(
      requireRequestedWorkspace(principal, workspaceId),
      query,
    );
  }

  @Get(':templateId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.templateService.getById(
      requireRequestedWorkspace(principal, workspaceId),
      templateId,
    );
  }

  @Patch(':templateId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(UpdateTemplateRequestSchema))
    input: UpdateTemplateRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.templateService.update(
      requireRequestedWorkspace(principal, workspaceId),
      templateId,
      input,
    );
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.templateService.remove(
      requireRequestedWorkspace(principal, workspaceId),
      templateId,
    );
  }
}
