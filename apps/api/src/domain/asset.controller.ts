import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateAssetRequestSchema,
  AssetListQuerySchema,
  UpdateAssetRequestSchema,
  type CreateAssetRequest,
  type AssetListQuery,
  type UpdateAssetRequest,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssetService } from './asset.service';
import { AuthorizationService } from '../security/authorization.service';
import { AuditService } from '../security/audit.service';

@Controller('workspaces/:workspaceId/assets')
@UseGuards(AuthenticationGuard)
export class AssetController {
  constructor(
    @Inject(AssetService) private readonly assetService: AssetService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateAssetRequestSchema)) input: CreateAssetRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.create', workspaceId);
    const result = await this.assetService.create(
      requireRequestedWorkspace(principal, workspaceId),
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'asset.create',
        resourceType: 'asset',
        resourceId: result.id,
        workspaceId,
        result: 'success',
        metadata: { filename: result.filename },
      })
      .catch(() => undefined);
    return result;
  }

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query(new ZodValidationPipe(AssetListQuerySchema)) query: AssetListQuery,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.read', workspaceId);
    return this.assetService.list(
      requireRequestedWorkspace(principal, workspaceId),
      query,
    );
  }

  @Get(':assetId')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('assetId') assetId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.read', workspaceId);
    return this.assetService.getById(
      requireRequestedWorkspace(principal, workspaceId),
      assetId,
    );
  }

  @Patch(':assetId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('assetId') assetId: string,
    @Body(new ZodValidationPipe(UpdateAssetRequestSchema)) input: UpdateAssetRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.update', workspaceId);
    const result = await this.assetService.update(
      requireRequestedWorkspace(principal, workspaceId),
      assetId,
      input,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'asset.update',
        resourceType: 'asset',
        resourceId: assetId,
        workspaceId,
        result: 'success',
        metadata: { changedFields: Object.keys(input) },
      })
      .catch(() => undefined);
    return result;
  }

  @Get(':assetId/usages')
  async usages(
    @Param('workspaceId') workspaceId: string,
    @Param('assetId') assetId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.read', workspaceId);
    return this.assetService.usages(
      requireRequestedWorkspace(principal, workspaceId),
      assetId,
    );
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('assetId') assetId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'asset.delete', workspaceId);
    await this.assetService.remove(
      requireRequestedWorkspace(principal, workspaceId),
      assetId,
    );
    await this.audit
      .record({
        actorType: 'user',
        actorId: principal?.subject ?? 'unknown',
        action: 'asset.delete',
        resourceType: 'asset',
        resourceId: assetId,
        workspaceId,
        result: 'success',
      })
      .catch(() => undefined);
  }
}
