import { Inject, Injectable, Logger } from '@nestjs/common';
import { type DeleteSiteRequest, type SiteDeletionSummary, siteNameConfirms } from '@plp/contracts';
import { notFound, validationFailed } from '../../shared/errors.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ASSET_STORAGE, type AssetStorage, siteStoragePrefix } from '../assets/asset-storage.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { DomainsRepository } from '../domains/domains.repository.js';
import { LeadsRepository } from '../leads/leads.repository.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { RevalidationClient } from '../revalidation/revalidation.client.js';
import { AccessService } from '../workspaces/access.service.js';
import { InvitationsRepository } from '../workspaces/invitations.repository.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import type { SiteRecord } from './site.schema.js';
import { SiteErasure } from './site-erasure.js';
import { SitesRepository } from './sites.repository.js';
import { SITE_NOT_FOUND, type SiteAccess, SitesService } from './sites.service.js';

/** "Xóa site" (ADR-027): what it removes, and the deletion itself. */
@Injectable()
export class SiteDeletionService {
  private readonly logger = new Logger(SiteDeletionService.name);

  constructor(
    private readonly sitesService: SitesService,
    private readonly access: AccessService,
    private readonly sites: SitesRepository,
    private readonly erasure: SiteErasure,
    private readonly pages: PagesRepository,
    private readonly leads: LeadsRepository,
    private readonly domains: DomainsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly invitations: InvitationsRepository,
    private readonly transactions: TransactionRunner,
    private readonly revalidation: RevalidationClient,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStorage,
  ) {}

  /** The counts of the card "Xóa site", for those who may delete it. */
  async summary(user: AuthenticatedUser, siteId: string): Promise<SiteDeletionSummary> {
    const { scope, site } = await this.deleter(user, siteId);
    const [pages, livePages, leads, domains] = await Promise.all([
      this.pages.countForSite(scope, site._id),
      this.pages.countLiveForSite(scope, site._id),
      this.leads.countForSite(scope, site._id),
      this.domains.listForSite(scope, site._id),
    ]);
    return { pages, livePages, leads, domains: domains.map((domain) => domain.hostname) };
  }

  /**
   * Deletes the site with its name typed again, in one transaction over the master and the
   * workspace database (ADR-025):
   * - master: its address (the subdomain is free again) and its custom domains, the site taken out
   *   of the members' sites and of invitations, pending invitations left with no site revoked;
   * - workspace database: the site and every document of it, leads included, deleted for good.
   * After the commit its stored images go and the renderer forgets it. Those two only log a
   * failure, with the site id: the deletion stands, and a leftover image is a public file nothing
   * refers to. No activity is recorded: the site's log is deleted with it, and the workspace has
   * none (ADR-021).
   */
  async delete(user: AuthenticatedUser, siteId: string, input: DeleteSiteRequest): Promise<void> {
    const { scope, site } = await this.deleter(user, siteId);
    if (!siteNameConfirms(input.confirmName, site.name)) {
      throw validationFailed([
        { path: ['confirmName'], code: 'mismatch', message: 'Tên site chưa đúng' },
      ]);
    }
    const now = new Date();
    await this.transactions.run(async (tx) => {
      if (!(await this.sites.deleteAddress(scope, site._id, tx))) {
        // Deleted by a request at the same moment.
        throw notFound(SITE_NOT_FOUND);
      }
      await this.domains.removeForSite(scope, site._id, tx);
      await this.workspaces.removeSiteFromMembers(scope, site._id, tx);
      await this.invitations.removeSite(scope, site._id, now, tx);
      await this.erasure.erase(scope, site._id, tx);
    });
    this.logger.log({ siteId: site._id.toHexString() }, 'Site deleted');
    await this.afterCommit(scope, site);
  }

  /** Both permissions: the site goes, and so do the leads of the people who sent its forms. */
  private async deleter(user: AuthenticatedUser, siteId: string): Promise<SiteAccess> {
    const granted = await this.sitesService.access(user, siteId, 'sites.manage');
    this.access.require(granted.scope, 'personalData.manage');
    return granted;
  }

  private async afterCommit(scope: WorkspaceScope, site: SiteRecord): Promise<void> {
    // The site id only: never what the site held (rule 10).
    const ids = { siteId: site._id.toHexString() };
    try {
      // A lead, a view or an upload that read the site before the commit may have been written
      // while the transaction ran, which did not see it. Lead intake removes one stored later.
      await this.erasure.erase(scope, site._id);
    } catch (error) {
      this.logger.error({ ...ids, err: error }, 'Data written during a site deletion not removed');
    }
    try {
      await this.storage.deletePrefix(
        siteStoragePrefix({ workspaceId: scope.workspaceId, siteId: site._id }),
      );
    } catch (error) {
      this.logger.error(
        { ...ids, err: error },
        'Images of a deleted site not removed from storage',
      );
    }
    // The client logs and retries; it never throws.
    if ((await this.revalidation.revalidateSite(site.subdomain)) === 'failed') {
      this.logger.error(ids, 'Renderer cache of a deleted site not refreshed');
    }
  }
}
