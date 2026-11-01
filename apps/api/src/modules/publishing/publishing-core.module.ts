import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APPROVAL_MODEL, approvalSchema } from './approval.schema.js';
import { ApprovalsRepository } from './approvals.repository.js';
import { REDIRECT_MODEL, redirectSchema } from './redirect.schema.js';
import { RedirectsRepository } from './redirects.repository.js';
import { RELEASE_MODEL, releaseSchema } from './release.schema.js';
import { ReleasesRepository } from './releases.repository.js';

/**
 * Release, redirect and publish-request persistence, without HTTP. Pages (status of each page),
 * preview and public delivery read releases; only the publishing module writes them. It is
 * separate from `PublishingModule` because publishing depends on pages, which itself needs
 * releases and requests.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RELEASE_MODEL, schema: releaseSchema },
      { name: REDIRECT_MODEL, schema: redirectSchema },
      { name: APPROVAL_MODEL, schema: approvalSchema },
    ]),
  ],
  providers: [ReleasesRepository, RedirectsRepository, ApprovalsRepository],
  exports: [ReleasesRepository, RedirectsRepository, ApprovalsRepository],
})
export class PublishingCoreModule {}
