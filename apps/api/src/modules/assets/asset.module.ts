import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../../common/guards/authentication.module';
import { SecurityModule } from '../../security/security.module';
import { TenantModelsModule } from '../../tenancy/tenant-models.module';
import { TenantModule } from '../../tenancy/tenant.module';
import { AssetController } from './asset.controller';
import { AssetFolderController } from './asset-folder.controller';
import { AssetFolderService } from './asset-folder.service';
import { CoreAssetReferenceAdapter } from './core-asset-reference.adapter';
import { AssetService } from './asset.service';
import { ASSET_STORAGE, LocalFilesystemAssetStorageProvider } from './asset-storage';
import { PublicAssetController } from './public-asset.controller';
import {
  ASSET_REFERENCE_IMPLEMENTATION,
  ASSET_REFERENCE_PORT,
  type AssetReferencePort,
} from '../../shared/asset-reference-port';

@Module({
  imports: [AuthenticationModule, SecurityModule, TenantModelsModule, TenantModule],
  controllers: [AssetController, AssetFolderController, PublicAssetController],
  providers: [
    AssetService,
    AssetFolderService,
    CoreAssetReferenceAdapter,
    {
      provide: ASSET_REFERENCE_PORT,
      useFactory: (
        platform: AssetReferencePort | undefined,
        core: CoreAssetReferenceAdapter,
      ) => platform ?? core,
      inject: [
        { token: ASSET_REFERENCE_IMPLEMENTATION, optional: true },
        CoreAssetReferenceAdapter,
      ],
    },
    { provide: ASSET_STORAGE, useClass: LocalFilesystemAssetStorageProvider },
  ],
})
export class AssetModule {}
