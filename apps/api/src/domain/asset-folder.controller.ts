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
  UseGuards,
} from '@nestjs/common';
import {
  CreateAssetFolderRequestSchema,
  UpdateAssetFolderRequestSchema,
  type CreateAssetFolderRequest,
  type UpdateAssetFolderRequest,
} from '@payload/contracts';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthorizationService } from '../security/authorization.service';
import { AssetFolderService } from './asset-folder.service';

@Controller('workspaces/:workspaceId/asset-folders')
@UseGuards(AuthenticationGuard)
export class AssetFolderController {
  constructor(
    @Inject(AssetFolderService) private readonly folders: AssetFolderService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.read', workspaceId);
    return this.folders.list(requireRequestedWorkspace(principal, workspaceId));
  }

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateAssetFolderRequestSchema))
    input: CreateAssetFolderRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.create', workspaceId);
    return this.folders.create(requireRequestedWorkspace(principal, workspaceId), input);
  }

  @Patch(':folderId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('folderId') folderId: string,
    @Body(new ZodValidationPipe(UpdateAssetFolderRequestSchema))
    input: UpdateAssetFolderRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    await this.authorization.assertCan(principal, 'asset.update', workspaceId);
    return this.folders.update(
      requireRequestedWorkspace(principal, workspaceId),
      folderId,
      input,
    );
  }

  @Delete(':folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('folderId') folderId: string,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ): Promise<void> {
    await this.authorization.assertCan(principal, 'asset.delete', workspaceId);
    await this.folders.remove(
      requireRequestedWorkspace(principal, workspaceId),
      folderId,
    );
  }
}
