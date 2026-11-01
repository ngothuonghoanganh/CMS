import { Module } from '@nestjs/common';
import { APPROVAL_COLLECTION } from './approval.schema.js';
import { ApprovalsRepository } from './approvals.repository.js';
import { REDIRECT_COLLECTION } from './redirect.schema.js';
import { RedirectsRepository } from './redirects.repository.js';
import { ReleaseErasureRepository } from './release-erasure.repository.js';
import { RELEASE_COLLECTION } from './release.schema.js';
import { ReleasesRepository } from './releases.repository.js';
import { WorkspaceCollectionsModule } from '../../shared/persistence/workspace-databases.js';

/**
 * Release, redirect and publish-request persistence, without HTTP. Pages (status of each page),
 * preview and public delivery read releases; only the publishing module writes them, and only
 * deleting a page removes them (`ReleaseErasureRepository`, ADR-027). It is separate from
 * `PublishingModule` because publishing depends on pages, which itself needs releases and
 * requests.
 */
@Module({
  imports: [
    WorkspaceCollectionsModule.forFeature([
      RELEASE_COLLECTION,
      REDIRECT_COLLECTION,
      APPROVAL_COLLECTION,
    ]),
  ],
  providers: [
    ReleasesRepository,
    ReleaseErasureRepository,
    RedirectsRepository,
    ApprovalsRepository,
  ],
  exports: [ReleasesRepository, ReleaseErasureRepository, RedirectsRepository, ApprovalsRepository],
})
export class PublishingCoreModule {}
