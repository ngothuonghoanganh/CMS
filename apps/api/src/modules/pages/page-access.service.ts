import { Injectable } from '@nestjs/common';
import { notFound } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import type { SiteRecord } from '../sites/site.schema.js';
import { SitesService } from '../sites/sites.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { PageRecord } from './page.schema.js';
import { PagesRepository } from './pages.repository.js';

export const PAGE_NOT_FOUND = 'Không tìm thấy trang';

/** A page the user may access, with its site and the scope for repository calls. */
export interface PageAccess {
  scope: WorkspaceScope;
  site: SiteRecord;
  page: PageRecord;
}

@Injectable()
export class PageAccessService {
  constructor(
    private readonly pages: PagesRepository,
    private readonly sites: SitesService,
  ) {}

  /**
   * Entry point of every page endpoint (pages, publishing, preview): checks membership in the
   * page's workspace through its site. Unknown and foreign pages are both 404 (ADR-003).
   */
  async access(user: AuthenticatedUser, pageId: string): Promise<PageAccess> {
    const id = toObjectId(pageId, PAGE_NOT_FOUND);
    const ref = await this.pages.findAccessRef(id);
    if (!ref) {
      throw notFound(PAGE_NOT_FOUND);
    }
    const { scope, site } = await this.sites.accessById(user, ref.siteId, PAGE_NOT_FOUND);
    const page = await this.pages.findById(scope, id);
    if (!page || !page.siteId.equals(site._id)) {
      throw notFound(PAGE_NOT_FOUND);
    }
    return { scope, site, page };
  }
}
