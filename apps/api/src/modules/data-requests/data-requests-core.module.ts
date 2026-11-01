import { Module } from '@nestjs/common';
import { DATA_REQUEST_COLLECTION } from './data-request.schema.js';
import { DataRequestsRepository } from './data-requests.repository.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

/**
 * Data request persistence, without HTTP. Deleting a person's data from the inbox masks their
 * requests too (ADR-017), so the leads module needs the repository without the module that
 * depends on it.
 */
@Module({
  imports: [WorkspaceCollectionsModule.forFeature([DATA_REQUEST_COLLECTION])],
  providers: [DataRequestsRepository],
  exports: [DataRequestsRepository],
})
export class DataRequestsCoreModule {}
