import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  type Asset,
  type AssetListQuery,
  assetListQuerySchema,
  type AssetListResponse,
  type UpdateAssetRequest,
  updateAssetRequestSchema,
  uploadAssetFieldsSchema,
} from '@plp/contracts';
import { ZodPipe } from '../../shared/zod.pipe.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SitesService } from '../sites/sites.service.js';
import { AssetUploadInterceptor } from './asset-upload.interceptor.js';
import {
  AssetUploadService,
  type UploadAssetFieldValues,
  type UploadedImageFile,
} from './asset-upload.service.js';
import { AssetsService } from './assets.service.js';

@Controller()
export class AssetsController {
  constructor(
    private readonly sites: SitesService,
    private readonly assets: AssetsService,
    private readonly uploads: AssetUploadService,
  ) {}

  @Get('sites/:siteId/assets')
  async listForSite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Query(new ZodPipe(assetListQuerySchema)) query: AssetListQuery,
  ): Promise<AssetListResponse> {
    const { scope, site } = await this.sites.access(user, siteId);
    return this.assets.listForSite(scope, site._id, query);
  }

  /** multipart/form-data: `file` plus the fields of `uploadAssetFieldsSchema`. */
  @Post('sites/:siteId/assets')
  @UseInterceptors(AssetUploadInterceptor)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('siteId') siteId: string,
    @Body(new ZodPipe(uploadAssetFieldsSchema)) fields: UploadAssetFieldValues,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<Asset> {
    return this.uploads.upload(user, siteId, fields, file);
  }

  @Patch('assets/:assetId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assetId') assetId: string,
    @Body(new ZodPipe(updateAssetRequestSchema)) body: UpdateAssetRequest,
  ): Promise<Asset> {
    return this.assets.update(user, assetId, body);
  }
}
