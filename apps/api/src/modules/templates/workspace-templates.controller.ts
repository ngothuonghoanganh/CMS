import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createTemplateVersionRequestSchema,
  createWorkspaceTemplateRequestSchema,
  type ReuseTemplateVersionRequest,
  reuseTemplateVersionRequestSchema,
  type TemplateVersionListResponse,
  updateWorkspaceTemplateRequestSchema,
  type WorkspaceTemplate,
  type WorkspaceTemplateListResponse,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  type CreateTemplateVersionValues,
  type CreateWorkspaceTemplateValues,
  type UpdateWorkspaceTemplateValues,
  WorkspaceTemplatesService,
} from './workspace-templates.service.js';

/** Board 19 (ADR-030): the workspace's own templates and their versions. */
@Controller('workspaces/:workspaceId/workspace-templates')
export class WorkspaceTemplatesController {
  constructor(private readonly templates: WorkspaceTemplatesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceTemplateListResponse> {
    return this.templates.list(user, workspaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodPipe(createWorkspaceTemplateRequestSchema)) body: CreateWorkspaceTemplateValues,
  ): Promise<WorkspaceTemplate> {
    return this.templates.create(user, workspaceId, body);
  }

  @Patch(':templateId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body(new ZodPipe(updateWorkspaceTemplateRequestSchema)) body: UpdateWorkspaceTemplateValues,
  ): Promise<WorkspaceTemplate> {
    return this.templates.update(user, workspaceId, templateId, body);
  }

  @Post(':templateId/duplicate')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ): Promise<WorkspaceTemplate> {
    return this.templates.duplicate(user, workspaceId, templateId);
  }

  @Post(':templateId/archive')
  @HttpCode(200)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ): Promise<WorkspaceTemplate> {
    return this.templates.archive(user, workspaceId, templateId);
  }

  @Post(':templateId/restore')
  @HttpCode(200)
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ): Promise<WorkspaceTemplate> {
    return this.templates.restore(user, workspaceId, templateId);
  }

  @Get(':templateId/versions')
  versions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
  ): Promise<TemplateVersionListResponse> {
    return this.templates.listVersions(user, workspaceId, templateId);
  }

  @Post(':templateId/versions')
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body(new ZodPipe(createTemplateVersionRequestSchema)) body: CreateTemplateVersionValues,
  ): Promise<WorkspaceTemplate> {
    return this.templates.createVersion(user, workspaceId, templateId, body);
  }

  @Post(':templateId/versions/:version/reuse')
  reuse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Param('version') version: string,
    @Body(new ZodPipe(reuseTemplateVersionRequestSchema)) body: ReuseTemplateVersionRequest,
  ): Promise<WorkspaceTemplate> {
    return this.templates.reuse(user, workspaceId, templateId, version, body);
  }
}
