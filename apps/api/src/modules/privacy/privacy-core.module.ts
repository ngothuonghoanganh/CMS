import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CONSENT_VERSION_MODEL, consentVersionSchema } from './consent-version.schema.js';
import { ConsentVersionsRepository } from './consent-versions.repository.js';

/**
 * Consent version persistence, without HTTP. Pages (reminders) and publishing (the `leadCapture`
 * snapshot) read the current version; only the privacy module writes versions.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: CONSENT_VERSION_MODEL, schema: consentVersionSchema }]),
  ],
  providers: [ConsentVersionsRepository],
  exports: [ConsentVersionsRepository],
})
export class PrivacyCoreModule {}
