import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SitesCoreModule } from '../sites/sites-core.module.js';
import { ASSET_STORAGE, S3AssetStorage } from './asset-storage.js';
import { AssetUploadService } from './asset-upload.service.js';
import { ASSET_COLLECTION } from './asset.schema.js';
import { AssetsController } from './assets.controller.js';
import { AssetsRepository } from './assets.repository.js';
import { AssetsService } from './assets.service.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([ASSET_COLLECTION]),
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
