import { Module } from '@nestjs/common';
import { CONSENT_VERSION_COLLECTION } from './consent-version.schema.js';
import { ConsentVersionsRepository } from './consent-versions.repository.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

/**
 * Consent version persistence, without HTTP. Pages (reminders) and publishing (the `leadCapture`
 * snapshot) read the current version; only the privacy module writes versions.
 */
@Module({
  imports: [WorkspaceCollectionsModule.forFeature([CONSENT_VERSION_COLLECTION])],
  providers: [ConsentVersionsRepository],
  exports: [ConsentVersionsRepository],
})
export class PrivacyCoreModule {}
