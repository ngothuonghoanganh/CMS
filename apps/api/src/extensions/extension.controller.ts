import {
  BadRequestException,
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
  ExtensionConfigRequestSchema,
  ExtensionPermissionKeys as ExtensionPermissions,
  CreateCustomExtensionRequestSchema,
  UpdateCustomExtensionRequestSchema,
  type ExtensionConfigRequest,
  type ExtensionConfiguration,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditService } from '../security/audit.service';
import { AuthorizationService } from '../security/authorization.service';
import { TenantExtensionService } from './tenant-extension.service';

@Controller('extensions')
@UseGuards(AuthenticationGuard)
export class ExtensionController {
  constructor(
    @Inject(TenantExtensionService) private readonly extensions: TenantExtensionService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  createCustom(
    @Body(new ZodValidationPipe(CreateCustomExtensionRequestSchema)) input: unknown,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Manage, async () => {
      const result = await this.extensions.createCustom(input);
      await this.auditMutation(principal, 'extension.created', result.manifest.id);
      return result;
    });
  }

  @Get()
  list(@CurrentPrincipal() principal: PlatformRequest['auth']) {
    return this.withPermission(principal, ExtensionPermissions.Read, () =>
      this.extensions.list(),
    );
  }

  @Get(':extensionId')
  get(
    @Param('extensionId') extensionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Read, () =>
      this.extensions.get(extensionId),
    );
  }

  @Post(':extensionId/enable')
  enable(
    @Param('extensionId') extensionId: string,
    @Body() input: unknown,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Manage, async () => {
      const parsed = parseOptionalConfig(input);
      const result = await this.extensions.enable(extensionId, parsed?.configuration);
      await this.auditMutation(principal, 'extension.enabled', extensionId);
      return result;
    });
  }

  @Post(':extensionId/disable')
  disable(
    @Param('extensionId') extensionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Manage, async () => {
      const result = await this.extensions.disable(extensionId);
      await this.auditMutation(principal, 'extension.disabled', extensionId);
      return result;
    });
  }

  @Patch(':extensionId/config')
  updateConfig(
    @Param('extensionId') extensionId: string,
    @Body(new ZodValidationPipe(ExtensionConfigRequestSchema))
    input: ExtensionConfigRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Manage, async () => {
      const result = await this.extensions.updateConfiguration(
        extensionId,
        input.configuration,
      );
      await this.auditMutation(
        principal,
        'extension.configuration.updated',
        extensionId,
        {
          changedFields: Object.keys(input.configuration),
        },
      );
      return result;
    });
  }

  @Patch(':extensionId')
  updateCustom(
    @Param('extensionId') extensionId: string,
    @Body(new ZodValidationPipe(UpdateCustomExtensionRequestSchema)) input: unknown,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Manage, async () => {
      const result = await this.extensions.updateCustom(extensionId, input);
      await this.auditMutation(principal, 'extension.updated', extensionId);
      return result;
    });
  }

  @Delete(':extensionId')
  removeCustom(
    @Param('extensionId') extensionId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.withPermission(principal, ExtensionPermissions.Manage, async () => {
      await this.extensions.removeCustom(extensionId);
      await this.auditMutation(principal, 'extension.deleted', extensionId);
    });
  }

  private async withPermission<T>(
    principal: PlatformRequest['auth'],
    permission: 'extensions.read' | 'extensions.manage',
    operation: () => Promise<T>,
  ): Promise<T> {
    await this.authorization.assertCan(principal, permission);
    return operation();
  }

  private async auditMutation(
    principal: PlatformRequest['auth'],
    action: string,
    extensionId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action,
        resourceType: 'extension',
        resourceId: extensionId,
        ...(principal?.workspaceId ? { workspaceId: principal.workspaceId } : {}),
        result: 'success',
        ...(metadata ? { metadata } : {}),
      })
      .catch(() => undefined);
  }
}

function parseOptionalConfig(input: unknown): { configuration?: ExtensionConfiguration } {
  if (input === undefined || input === null) return {};
  const parsed = ExtensionConfigRequestSchema.partial().safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'EXTENSION_CONFIGURATION_INVALID',
      message: 'Extension configuration is invalid',
    });
  }
  return parsed.data.configuration === undefined
    ? {}
    : { configuration: parsed.data.configuration };
}
