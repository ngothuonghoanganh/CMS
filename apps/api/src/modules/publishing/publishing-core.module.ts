import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { REDIRECT_MODEL, redirectSchema } from './redirect.schema.js';
import { RedirectsRepository } from './redirects.repository.js';
import { RELEASE_MODEL, releaseSchema } from './release.schema.js';
import { ReleasesRepository } from './releases.repository.js';

/**
 * Release and redirect persistence, without HTTP. Pages (status of each page), preview and public
 * delivery read releases; only the publishing module writes them. It is separate from
 * `PublishingModule` because publishing depends on pages, which itself needs releases.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RELEASE_MODEL, schema: releaseSchema },
      { name: REDIRECT_MODEL, schema: redirectSchema },
    ]),
  ],
  providers: [ReleasesRepository, RedirectsRepository],
  exports: [ReleasesRepository, RedirectsRepository],
})
export class PublishingCoreModule {}
