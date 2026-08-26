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
  CreateIntegrationRequestSchema,
  PaginationQuerySchema,
  UpdateIntegrationRequestSchema,
  type CreateIntegrationRequest,
  type PaginationQuery,
  type UpdateIntegrationRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IntegrationService } from './integration.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('workspaces/:workspaceId/integrations')
@UseGuards(AuthenticationGuard)
export class IntegrationController {
  constructor(
    @Inject(IntegrationService) private readonly integrationService: IntegrationService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateIntegrationRequestSchema))
    input: CreateIntegrationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'integration.create', workspaceId);
    const result = await this.integrationService.create(
      requireRequestedWorkspace(principal, workspaceId),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'integration.create',
        resourceType: 'integration',
        resourceId: result.id,
        workspaceId,
        result: 'success',
        metadata: { type: result.type, name: result.name },
      })
      .catch(() => undefined);
    return result;
  }

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'integration.read', workspaceId);
    return this.integrationService.list(
      requireRequestedWorkspace(principal, workspaceId),
      query,
    );
  }

  @Get(':integrationId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('integrationId') integrationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'integration.read', workspaceId);
    return this.integrationService.getById(
      requireRequestedWorkspace(principal, workspaceId),
      integrationId,
    );
  }

  @Patch(':integrationId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('integrationId') integrationId: string,
    @Body(new ZodValidationPipe(UpdateIntegrationRequestSchema))
    input: UpdateIntegrationRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'integration.update', workspaceId);
    const result = await this.integrationService.update(
      requireRequestedWorkspace(principal, workspaceId),
      integrationId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'integration.update',
        resourceType: 'integration',
        resourceId: integrationId,
        workspaceId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Delete(':integrationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('integrationId') integrationId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'integration.delete', workspaceId);
    await this.integrationService.remove(
      requireRequestedWorkspace(principal, workspaceId),
      integrationId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'integration.delete',
        resourceType: 'integration',
        resourceId: integrationId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
  }
}
