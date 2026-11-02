import { Injectable } from '@nestjs/common';
import type {
  ApplyTemplateRequest,
  PageDetailResponse,
  TemplateCompositionResponse,
  TemplateRef,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { commitMayHaveApplied, TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { AssetsService } from '../assets/assets.service.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND } from '../sites/sites.service.js';
import { TemplateMaterializer } from '../templates/template-materializer.js';
import { PAGE_NOT_FOUND, PageAccessService } from './page-access.service.js';
import { revisionConflict } from './page-errors.js';
import { PageEvaluator } from './page-evaluator.service.js';
import type { PageRecord } from './page.schema.js';
import { PagesRepository } from './pages.repository.js';

/** Why a guarded write of the draft matched nothing: the page is gone, or its revision moved. */
type DraftRefusal = 'gone' | 'moved';

/**
 * A template applied to the draft of a page (ADR-030): only "Thay toàn bộ section". The title,
 * slug, SEO and the live page stay; the template's images are copied to the site first. Both ways
 * need `pages.edit` on the page's site, as creating a page from a template does.
 */
@Injectable()
export class PageTemplatesService {
  constructor(
    private readonly pageAccess: PageAccessService,
    private readonly pages: PagesRepository,
    private readonly sites: SitesRepository,
    private readonly templates: TemplateMaterializer,
    private readonly activity: ActivityRepository,
    private readonly assets: AssetsService,
    private readonly evaluator: PageEvaluator,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * "Áp dụng vào trang đang sửa…" of board 18: one save of the draft with `baseRevision`, as
   * autosave does (409 `revision_conflict` when it moved), with the activity "áp dụng mẫu". The
   * editor opens on it; "Quay về bản live" brings back the live sections.
   */
  async apply(
    user: AuthenticatedUser,
    siteId: string,
    pageId: string,
    input: ApplyTemplateRequest,
  ): Promise<PageDetailResponse> {
    const { scope, site, page } = await this.pageAccess.access(user, siteId, pageId, 'pages.edit');
    // A draft saved since is refused before any image is copied; the write checks it again.
    if (page.draft.revision !== input.baseRevision) {
      throw revisionConflict(page.draft.revision);
    }
    const template = await this.templates.materialize(scope, site._id, input.template);
    let outcome: PageRecord | DraftRefusal;
    try {
      outcome = await this.transactions.run(async (tx) => {
        // Only the sections: the slug and SEO are written back as they are at this revision.
        const current = await this.pages.findById(scope, page._id, tx);
        if (current === null) {
          return 'gone';
        }
        if (current.draft.revision !== input.baseRevision) {
          return 'moved';
        }
        const updated = await this.pages.replaceDraft(
          scope,
          page._id,
          input.baseRevision,
          { slug: current.draft.slug, composition: template.composition, seo: current.draft.seo },
          tx,
        );
        if (updated === null) {
          return 'moved';
        }
        await this.templates.insertImages(scope, template, tx);
        await this.activity.record(
          scope,
          {
            siteId: site._id,
            type: 'page.template_applied',
            page: { id: page._id, title: updated.title },
            data: { version: template.version, template: template.name },
          },
          tx,
        );
        return updated;
      });
    } catch (error) {
      // A commit that may have applied keeps them: the draft would name deleted images.
      if (!commitMayHaveApplied(error)) {
        await this.templates.discardImages(template, site._id);
      }
      throw error;
    }
    if (outcome === 'gone' || outcome === 'moved') {
      await this.templates.discardImages(template, site._id);
      const current = outcome === 'gone' ? null : await this.pages.findById(scope, page._id);
      throw current === null ? notFound(PAGE_NOT_FOUND) : revisionConflict(current.draft.revision);
    }
    const evaluated = await this.evaluator.evaluate(scope, site, outcome);
    return { page: evaluated.summary, draft: evaluated.draft, checks: evaluated.checks };
  }

  /**
   * "Áp dụng mẫu…" of the editor: the template's sections for this page, its images copied as the
   * site's assets now. The draft is not written: the editor applies the sections with one command
   * (one undo step) and autosaves them (ADR-008). The activity is recorded here, as the template
   * reaches the draft; undoing it in the editor is an edit like any other.
   */
  async composition(
    user: AuthenticatedUser,
    siteId: string,
    pageId: string,
    ref: TemplateRef,
  ): Promise<TemplateCompositionResponse> {
    const { scope, site, page } = await this.pageAccess.access(user, siteId, pageId, 'pages.edit');
    const template = await this.templates.materialize(scope, site._id, ref);
    let records;
    try {
      records = await this.transactions.run(async (tx) => {
        // The images belong to the site: deleting it at the same moment either waits and deletes
        // them too, or refuses them (ADR-027).
        if (!(await this.sites.recordDataWrite(scope, site._id, tx))) {
          throw notFound(SITE_NOT_FOUND);
        }
        const inserted = await this.templates.insertImages(scope, template, tx);
        await this.activity.record(
          scope,
          {
            siteId: site._id,
            type: 'page.template_applied',
            page: { id: page._id, title: page.title },
            data: { version: template.version, template: template.name },
          },
          tx,
        );
        return inserted;
      });
    } catch (error) {
      // A commit that may have applied keeps them: their asset records would name deleted files.
      if (!commitMayHaveApplied(error)) {
        await this.templates.discardImages(template, site._id);
      }
      throw error;
    }
    const uploader = { id: user.id.toHexString(), name: user.name };
    return {
      composition: template.composition,
      assets: records.map((record) => this.assets.toDto(record, uploader)),
      template: { name: template.name, version: template.version },
    };
  }
}
