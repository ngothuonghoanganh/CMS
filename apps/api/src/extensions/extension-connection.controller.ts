import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateExtensionConnectionRequestSchema,
  UpdateExtensionConnectionRequestSchema,
  type CreateExtensionConnectionRequest,
  type UpdateExtensionConnectionRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from '../security/audit.service';
import { AuthorizationService } from '../security/authorization.service';
import { ExtensionConnectionService } from './extension-connection.service';

@Controller('extensions/:extensionId/connections')
@UseGuards(AuthenticationGuard)
export class ExtensionConnectionController {
  constructor(
    @Inject(ExtensionConnectionService)
    private readonly connections: ExtensionConnectionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Param('extensionId') extensionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'extensions.read');
    return this.connections.list(extensionId);
  }

  @Post()
  async create(
    @Param('extensionId') extensionId: string,
    @Body(new ZodValidationPipe(CreateExtensionConnectionRequestSchema))
    input: CreateExtensionConnectionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'extensions.manage');
    const result = await this.connections.create(extensionId, input);
    await this.recordAudit(principal, 'extension.connection.created', result.id, {
      extensionId,
    });
    return result;
  }

  @Patch(':connectionId')
  async update(
    @Param('extensionId') extensionId: string,
    @Param('connectionId') connectionId: string,
    @Body(new ZodValidationPipe(UpdateExtensionConnectionRequestSchema))
    input: UpdateExtensionConnectionRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'extensions.manage');
    const result = await this.connections.update(extensionId, connectionId, input);
    await this.recordAudit(principal, 'extension.connection.updated', result.id, {
      extensionId,
      changedFields: Object.keys(input),
    });
    return result;
  }

  @Delete(':connectionId')
  async remove(
    @Param('extensionId') extensionId: string,
    @Param('connectionId') connectionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'extensions.manage');
    await this.connections.remove(extensionId, connectionId);
    await this.recordAudit(principal, 'extension.connection.deleted', connectionId, {
      extensionId,
    });
  }

  private async recordAudit(
    principal: PlatformRequest['auth'],
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action,
        resourceType: 'extension_connection',
        resourceId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        metadata,
      })
      .catch(() => undefined);
  }
}
