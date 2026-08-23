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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreateAssetRequestSchema,
  PaginationQuerySchema,
  type CreateAssetRequest,
  type PaginationQuery,
} from '@payload/contracts';

import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AuthenticationGuard } from '../common/guards/authentication.guard';
import { requireRequestedWorkspace } from '../common/guards/workspace-context';
import type { PlatformRequest } from '../common/interfaces/request';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssetService } from './asset.service';

@Controller('workspaces/:workspaceId/assets')
@UseGuards(AuthenticationGuard)
export class AssetController {
  constructor(@Inject(AssetService) private readonly assetService: AssetService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(CreateAssetRequestSchema)) input: CreateAssetRequest,
    @CurrentPrincipal() principal: PlatformRequest['auth'],
  ) {
    return this.assetService.create(
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
    return this.assetService.getById(
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
    await this.assetService.remove(
      requireRequestedWorkspace(principal, workspaceId),
      assetId,
    );
  }
}
