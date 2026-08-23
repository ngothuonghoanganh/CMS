import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  CreateWorkspaceRequestSchema,
  type CreateWorkspaceRequest,
} from '@payload/contracts';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireWorkspaceId } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { WorkspaceService } from './workspace.service';

@Controller('workspaces')
@UseGuards(AuthenticationGuard)
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateWorkspaceRequestSchema))
    input: CreateWorkspaceRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    requireWorkspaceId(principal);
    return this.workspaceService.create(input);
  }

  @Get(':workspaceId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.workspaceService.getById(workspaceId, requireWorkspaceId(principal));
  }
}
