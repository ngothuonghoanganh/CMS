import { Injectable } from '@nestjs/common';
import {
  can,
  type TemplateDetail,
  type TemplateDetailQuery,
  type TemplateListResponse,
  type TemplateSiteReadiness,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { toObjectId } from '../../shared/persistence/object-id.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { ConsentVersionsRepository } from '../privacy/consent-versions.repository.js';
import { siteLeadCaptureGaps } from '../publishing/release-presentation.js';
import { confirmedRecipientsOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  previewSectionIds,
  systemTemplateOrNotFound,
  systemTemplateSummaries,
  templateComposition,
  toTemplateSummary,
} from './template-catalog.js';

/**
 * The template library of a workspace (ADR-030). Every member sees it: browsing makes nothing, and
 * creating a page from a template is `POST /sites/:siteId/pages`, which needs `pages.edit` on the
 * target site.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly access: AccessService,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly consentVersions: ConsentVersionsRepository,
  ) {}

  async list(user: AuthenticatedUser, workspaceId: string): Promise<TemplateListResponse> {
    await this.scope(user, workspaceId);
    return { items: systemTemplateSummaries() };
  }

  /**
   * A template with its preview, and how many pages of the member's sites were made from it. With
   * a site, what that site still needs before a page with the template's form can go live.
   */
  async detail(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
    query: TemplateDetailQuery,
  ): Promise<TemplateDetail> {
    const scope = await this.scope(user, workspaceId);
    const template = systemTemplateOrNotFound(templateId);
    const [usedCount, site] = await Promise.all([
      this.pages.countCreatedFrom(
        scope,
        { source: 'system', templateId: template.id },
        scope.siteIds,
      ),
      query.siteId === undefined ? null : this.readiness(scope, query.siteId),
    ]);
    return {
      ...toTemplateSummary(template),
      details: template.details,
      composition: templateComposition(template, previewSectionIds()),
      usedCount,
      site,
    };
  }

  /** Membership of the workspace, then the permission every member holds (ADR-020). */
  private async scope(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'pages.view');
    return scope;
  }

  /**
   * "Cần có trước khi xuất bản" for a site of this workspace the member may open; any other site
   * is not found (ADR-025). Who receives the leads is shown to the roles that see it (ADR-020).
   */
  private async readiness(scope: WorkspaceScope, siteId: string): Promise<TemplateSiteReadiness> {
    const id = toObjectId(siteId, SITE_NOT_FOUND);
    const site = this.access.coversSite(scope, id) ? await this.sites.findById(scope, id) : null;
    if (!site) {
      throw notFound(SITE_NOT_FOUND);
    }
    const consent = await this.consentVersions.findCurrent(scope, site._id);
    const recipients = confirmedRecipientsOf(site);
    return {
      siteId: site._id.toHexString(),
      confirmedRecipients: recipients.length,
      recipientEmail: can(scope.access, 'leads.view') ? (recipients[0]?.email ?? null) : null,
      consentVersion: consent?.version ?? null,
      consentGaps: siteLeadCaptureGaps(site, consent),
    };
  }
}
