import { Injectable } from '@nestjs/common';
import {
  can,
  isWorkspaceTemplateId,
  type PublicImage,
  type TemplateDetail,
  type TemplateDetailQuery,
  type TemplateListResponse,
  type TemplateSiteReadiness,
  type TemplateSummary,
} from '@plp/contracts';
import { notFound } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { AssetsService } from '../assets/assets.service.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { PagesRepository } from '../pages/pages.repository.js';
import { ConsentVersionsRepository } from '../privacy/consent-versions.repository.js';
import { siteLeadCaptureGaps } from '../publishing/release-presentation.js';
import { confirmedRecipientsOf } from '../sites/site.schema.js';
import { SitesRepository } from '../sites/sites.repository.js';
import { SITE_NOT_FOUND } from '../sites/sites.service.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { templateVisibleTo, visibleSiteIds } from './domain/template-scope.js';
import {
  previewSectionIds,
  systemTemplateOrNotFound,
  systemTemplateSummaries,
  TEMPLATE_NOT_FOUND,
  templateComposition,
  toTemplateSummary,
} from './template-catalog.js';
import type { TemplateRecord, TemplateVersionRecord } from './template.schema.js';
import {
  type TemplateVersionOutline,
  TemplateVersionsRepository,
} from './template-versions.repository.js';
import { TemplatesRepository } from './templates.repository.js';

/** What a template's detail adds to its card, whichever its source. */
type DetailContent = Omit<TemplateDetail, 'usedCount' | 'site'>;

/**
 * The template library of a workspace (ADR-030): the system templates, then the workspace's own.
 * Every member sees it: browsing makes nothing, and creating a page from a template is
 * `POST /sites/:siteId/pages`, which needs `pages.edit` on the target site.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly access: AccessService,
    private readonly sites: SitesRepository,
    private readonly pages: PagesRepository,
    private readonly consentVersions: ConsentVersionsRepository,
    private readonly templates: TemplatesRepository,
    private readonly versions: TemplateVersionsRepository,
    private readonly assets: AssetsService,
  ) {}

  /**
   * The system templates in the catalog's order, then the workspace templates the member sees and
   * that are not archived, last changed first (ADR-030). Bounded: 12 and at most 100.
   */
  async list(user: AuthenticatedUser, workspaceId: string): Promise<TemplateListResponse> {
    const scope = await this.scope(user, workspaceId);
    const own = (await this.templates.listForWorkspace(scope)).filter(
      (template) =>
        template.archivedAt === null && templateVisibleTo(template.scope, scope.siteIds),
    );
    const outlines = await this.versions.findOutlines(
      scope,
      own.map((template) => ({ templateId: template._id, version: template.currentVersion })),
    );
    return {
      items: [
        ...systemTemplateSummaries(),
        ...own.map((template) =>
          this.workspaceSummary(scope, template, outlineOf(outlines, template)),
        ),
      ],
    };
  }

  /**
   * A template with its preview, and how many pages of the member's sites were made from it. With
   * a site, what that site still needs before a page with the template's form can go live. A
   * 24-hex id names a workspace template the member sees, at `version` or its current one.
   */
  async detail(
    user: AuthenticatedUser,
    workspaceId: string,
    templateId: string,
    query: TemplateDetailQuery,
  ): Promise<TemplateDetail> {
    const scope = await this.scope(user, workspaceId);
    const content = isWorkspaceTemplateId(templateId)
      ? await this.workspaceDetail(scope, toObjectId(templateId), query.version)
      : this.systemDetail(templateId, query.version);
    const [usedCount, site] = await Promise.all([
      this.pages.countCreatedFrom(
        scope,
        { source: content.source, templateId: content.id },
        scope.siteIds,
      ),
      query.siteId === undefined ? null : this.readiness(scope, query.siteId),
    ]);
    return { ...content, usedCount, site };
  }

  /** Membership of the workspace, then the permission every member holds (ADR-020). */
  private async scope(user: AuthenticatedUser, workspaceId: string): Promise<WorkspaceScope> {
    const scope = await this.access.scopeForWorkspace(user, workspaceId);
    this.access.require(scope, 'pages.view');
    return scope;
  }

  /** A system template keeps only its current version: any other is not found. */
  private systemDetail(templateId: string, version: number | undefined): DetailContent {
    const template = systemTemplateOrNotFound(templateId);
    if (version !== undefined && version !== template.version) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return {
      ...toTemplateSummary(template),
      details: template.details,
      currentVersion: template.version,
      archived: false,
      composition: templateComposition(template, previewSectionIds()),
      // Its image frames are empty (ADR-030).
      images: {},
    };
  }

  /**
   * A workspace template the member sees, archived or not, at one of its versions. Its images are
   * the template's own copies, public like the pages' images (ADR-012).
   */
  private async workspaceDetail(
    scope: WorkspaceScope,
    id: ObjectId,
    requested: number | undefined,
  ): Promise<DetailContent> {
    const template = await this.templates.findVisible(scope, id);
    if (template === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    const shown = requested ?? template.currentVersion;
    const version =
      shown > template.currentVersion ? null : await this.versions.find(scope, id, shown);
    if (version === null) {
      throw notFound(TEMPLATE_NOT_FOUND);
    }
    return {
      ...this.workspaceSummary(scope, template, version),
      details: template.description,
      currentVersion: template.currentVersion,
      archived: template.archivedAt !== null,
      composition: version.composition,
      images: this.imagesOf(version),
    };
  }

  private workspaceSummary(
    scope: WorkspaceScope,
    template: TemplateRecord,
    version: TemplateVersionOutline,
  ): TemplateSummary {
    return {
      id: template._id.toHexString(),
      source: 'workspace',
      version: version.version,
      updatedAt: version.createdAt.toISOString(),
      name: template.name,
      description: template.description,
      goal: template.goal,
      industry: template.industry,
      hasForm: version.hasForm,
      sections: version.sections,
      siteIds: visibleSiteIds(template.scope, scope.siteIds),
    };
  }

  private imagesOf(version: TemplateVersionRecord): Record<string, PublicImage> {
    return Object.fromEntries(
      version.assets.map((asset) => [
        asset.assetId,
        { url: this.assets.publicUrl(asset), width: asset.width, height: asset.height },
      ]),
    );
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

function outlineOf(
  outlines: ReadonlyMap<string, TemplateVersionOutline>,
  template: TemplateRecord,
): TemplateVersionOutline {
  const outline = outlines.get(template._id.toHexString());
  if (outline === undefined) {
    throw new Error(
      `Template ${template._id.toHexString()} has no version ${template.currentVersion}`,
    );
  }
  return outline;
}
