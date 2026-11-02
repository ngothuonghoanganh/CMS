import { Injectable } from '@nestjs/common';
import { AppError, notFound } from '../../shared/errors.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { ApprovalsRepository } from '../publishing/approvals.repository.js';
import { RedirectsRepository } from '../publishing/redirects.repository.js';
import { ReleaseErasureRepository } from '../publishing/release-erasure.repository.js';
import { PAGE_NOT_FOUND, PageAccessService } from './page-access.service.js';
import { PagesRepository } from './pages.repository.js';

/** 409 for a page that is live: it goes off the web through "Gỡ xuất bản" first (ADR-027). */
export function pageLive(): AppError {
  return new AppError(409, 'page_live', 'Gỡ trang khỏi live trước khi xóa', {
    detail: 'Trang đang live. Gỡ xuất bản trang, rồi xóa trang.',
  });
}

/** The page could not be deleted in the transaction; why is read once it is over. */
class NotDeleted extends Error {}

/** "Xóa trang" (ADR-027). */
@Injectable()
export class PageDeletionService {
  constructor(
    private readonly pageAccess: PageAccessService,
    private readonly pages: PagesRepository,
    private readonly redirects: RedirectsRepository,
    private readonly approvals: ApprovalsRepository,
    private readonly releases: ReleaseErasureRepository,
    private readonly leads: LeadsRepository,
    private readonly activity: ActivityRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Deletes a page that is not live, in one transaction:
   * 1. the page, only while its pointer is null, so a publish at the same moment makes one fail
   *    and a live release never loses its page;
   * 2. its redirects and requests to publish;
   * 3. its releases, except those a lead refers to as consent evidence (rule 10), which stay
   *    unchanged and are never served: the renderer only goes from a page to its release;
   * 4. the `page.deleted` activity, with the title and slug.
   * Leads, "Hiệu quả" and the page's earlier activity stay. Nothing was live, so nothing is
   * revalidated.
   */
  async delete(user: AuthenticatedUser, siteId: string, pageId: string): Promise<void> {
    const { scope, site, page } = await this.pageAccess.access(
      user,
      siteId,
      pageId,
      'pages.manageLive',
    );
    if (page.publishedReleaseId !== null) {
      throw pageLive();
    }
    try {
      await this.transactions.run(async (tx) => {
        if (!(await this.pages.deleteIfNotLive(scope, site._id, page._id, tx))) {
          throw new NotDeleted();
        }
        const ids = { siteId: site._id, pageId: page._id };
        await this.redirects.deleteForPage(scope, site._id, page._id, tx);
        await this.approvals.deleteForPage(scope, site._id, page._id, tx);
        const evidence = await this.leads.releaseIdsOfPage(scope, site._id, page._id, tx);
        await this.releases.deleteForPage(scope, ids, evidence, tx);
        await this.activity.record(
          scope,
          {
            siteId: site._id,
            type: 'page.deleted',
            page: { id: page._id, title: page.title },
            data: { slug: page.draft.slug },
          },
          tx,
        );
      });
    } catch (error) {
      if (!(error instanceof NotDeleted)) {
        throw error;
      }
      // Published or deleted since it was read: the transaction is over, read what happened.
      const current = await this.pages.findById(scope, page._id);
      throw current === null ? notFound(PAGE_NOT_FOUND) : pageLive();
    }
  }
}
