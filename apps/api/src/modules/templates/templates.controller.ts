import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type TemplateDetail,
  type TemplateDetailQuery,
  templateDetailQuerySchema,
  type TemplateListResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { TemplatesService } from './templates.service.js';

@Controller()
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get('workspaces/:workspaceId/templates')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<TemplateListResponse> {
    return this.templates.list(user, workspaceId);
  }

  @Get('workspaces/:workspaceId/templates/:templateId')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Query(new ZodPipe(templateDetailQuerySchema)) query: TemplateDetailQuery,
  ): Promise<TemplateDetail> {
    return this.templates.detail(user, workspaceId, templateId, query);
  }
}
