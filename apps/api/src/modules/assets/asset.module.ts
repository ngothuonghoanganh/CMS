import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { AssetController } from './asset.controller';
import { AssetFolderController } from './asset-folder.controller';
import { AssetFolderService } from './asset-folder.service';
import {
  ASSET_REFERENCE_PORT_PROVIDER,
  AssetReferenceAdapter,
} from './asset-reference.adapter';
import { AssetService } from './asset.service';
import { ASSET_STORAGE, LocalFilesystemAssetStorageProvider } from './asset-storage';
import { PublicAssetController } from './public-asset.controller';

@Module({
  imports: [AuthenticationModule, SecurityModule, TenantModelsModule, TenantModule],
  controllers: [AssetController, AssetFolderController, PublicAssetController],
  providers: [
    AssetService,
    AssetFolderService,
    AssetReferenceAdapter,
    ASSET_REFERENCE_PORT_PROVIDER,
    { provide: ASSET_STORAGE, useClass: LocalFilesystemAssetStorageProvider },
  ],
})
export class AssetModule {}
