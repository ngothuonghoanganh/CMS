import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AssetService } from './asset.service';

/** Published asset bytes are addressed by the opaque asset id. Metadata and
 * storage keys are never accepted from the browser as filesystem paths. */
@Controller('public/assets')
export class PublicAssetController {
  constructor(@Inject(AssetService) private readonly assets: AssetService) {}

  @Get(':workspaceId/:assetId/:filename')
  async get(
    @Param('workspaceId') workspaceId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const result = await this.assets.readPublic(workspaceId, assetId);
      response.type(result.asset.mimeType).send(result.data);
    } catch {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset was not found',
      });
    }
  }
}
