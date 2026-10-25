import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { ASSET_STORAGE, S3AssetStorage } from './asset-storage.js';
import { AssetUploadService } from './asset-upload.service.js';
import { ASSET_MODEL, assetSchema } from './asset.schema.js';
import { AssetsController } from './assets.controller.js';
import { AssetsRepository } from './assets.repository.js';
import { AssetsService } from './assets.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ASSET_MODEL, schema: assetSchema }]),
    ActivityModule,
    AuthModule,
    SitesCoreModule,
  ],
  controllers: [AssetsController],
  providers: [
    AssetsRepository,
    AssetsService,
    AssetUploadService,
    { provide: ASSET_STORAGE, useClass: S3AssetStorage },
  ],
  exports: [AssetsRepository, AssetsService],
})
export class AssetsModule {}
