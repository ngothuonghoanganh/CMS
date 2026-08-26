import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  CreateWorkspaceRequestSchema,
  type CreateWorkspaceRequest,
} from '@payload/contracts';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import {
  requireOrganizationId,
  requireRequestedWorkspace,
} from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { WorkspaceService } from './workspace.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('workspaces')
@UseGuards(AuthenticationGuard)
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateWorkspaceRequestSchema))
    input: CreateWorkspaceRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.create');
    const result = await this.workspaceService.create(
      input,
      requireOrganizationId(principal),
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'workspace.create',
        resourceType: 'workspace',
        resourceId: result.id,
        ...(result.id ? { workspaceId: result.id } : {}),
        result: 'success',
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':workspaceId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'workspace.read', workspaceId);
    return this.workspaceService.getById(
      workspaceId,
      requireRequestedWorkspace(principal, workspaceId),
      requireOrganizationId(principal),
    );
  }
}
