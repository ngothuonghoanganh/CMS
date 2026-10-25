import { Injectable } from '@nestjs/common';
import {
  type createSiteRequestSchema,
  MAX_SITES_PER_WORKSPACE,
  type ProblemIssue,
  type Site,
  type UpdateSiteRequest,
} from '@plp/contracts';
import type { z } from 'zod';
import { AppError, notFound, validationFailed } from '../../shared/errors.js';
import { type ObjectId, toObjectId } from '../../shared/persistence/object-id.js';
import { TransactionRunner } from '../../shared/persistence/transaction.js';
import { ActivityRepository } from '../activity/activity.repository.js';
import { AssetsRepository } from '../assets/assets.repository.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { AccessService } from '../workspaces/access.service.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { WorkspacesRepository } from '../workspaces/workspaces.repository.js';
import type { SiteRecord } from './site.schema.js';
import { type SitePatch, SitesRepository } from './sites.repository.js';
import { SITE_NOT_FOUND, SitesService } from './sites.service.js';

/** Body of `POST /workspaces/:workspaceId/sites` after the contract schema applied defaults. */
export type CreateSiteValues = z.output<typeof createSiteRequestSchema>;

export const ASSET_NOT_IN_SITE_MESSAGE = 'Ảnh không có trong thư viện của site này';

export const SITE_LIMIT_MESSAGE = `Mỗi workspace có tối đa ${MAX_SITES_PER_WORKSPACE} site`;

const ASSET_FIELDS = ['logoAssetId', 'defaultShareImageAssetId'] as const;

/** Owner-only site changes (ADR-004): creating a site and editing its settings. */
@Injectable()
export class SiteManagementService {
  constructor(
    private readonly sites: SitesRepository,
    private readonly sitesService: SitesService,
    private readonly access: AccessService,
    private readonly workspaces: WorkspacesRepository,
    private readonly assets: AssetsRepository,
    private readonly activity: ActivityRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  /**
   * Creates the site and its `site.created` activity in one transaction. The limit is checked
   * inside it, after a write to the workspace that serializes concurrent creations, so the 101st
   * site is refused even when requests race (ADR-014).
   */
  async create(
    user: AuthenticatedUser,
    workspaceId: string,
    input: CreateSiteValues,
  ): Promise<Site> {
    const scope = await this.sitesService.scopeForWorkspace(user, workspaceId);
    this.access.requireOwner(scope);
    const site = await this.transactions.run(async (tx) => {
      await this.workspaces.recordSiteCreation(scope, tx);
      if ((await this.sites.countForWorkspace(scope, tx)) >= MAX_SITES_PER_WORKSPACE) {
        throw new AppError(409, 'site_limit_reached', SITE_LIMIT_MESSAGE);
      }
      const created = await this.sites.create(scope, input, tx);
      await this.activity.record(scope, { siteId: created._id, type: 'site.created' }, tx);
      return created;
    });
    return this.sitesService.toDto(site);
  }

  /**
   * Name, theme, logo and default share image; images must come from this site's library. Live
   * pages keep the settings their release snapshotted until each one is published again
   * (ADR-015), so nothing is revalidated here: the change reaches no live page (releases from
   * before ADR-015 aside, which pick it up when the renderer cache expires).
   */
  async update(user: AuthenticatedUser, siteId: string, input: UpdateSiteRequest): Promise<Site> {
    const { scope, site } = await this.sitesService.access(user, siteId);
    this.access.requireOwner(scope);
    const patch = await this.toPatch(scope, site, input);
    const updated = await this.sites.update(scope, site._id, patch);
    if (!updated) {
      throw notFound(SITE_NOT_FOUND);
    }
    return this.sitesService.toDto(updated);
  }

  private async toPatch(
    scope: WorkspaceScope,
    site: SiteRecord,
    input: UpdateSiteRequest,
  ): Promise<SitePatch> {
    const patch: SitePatch = {};
    if (input.name !== undefined) {
      patch.name = input.name;
    }
    if (input.themePresetId !== undefined) {
      patch.themePresetId = input.themePresetId;
    }
    const referenced: { field: (typeof ASSET_FIELDS)[number]; id: ObjectId }[] = [];
    for (const field of ASSET_FIELDS) {
      const value = input[field];
      if (value === undefined) {
        continue;
      }
      const id = value === null ? null : toObjectId(value);
      patch[field] = id;
      if (id !== null) {
        referenced.push({ field, id });
      }
    }
    if (referenced.length > 0) {
      const found = await this.assets.findForSite(
        scope,
        site._id,
        referenced.map(({ id }) => id),
      );
      const issues: ProblemIssue[] = referenced
        .filter(({ id }) => !found.has(id.toHexString()))
        .map(({ field }) => ({
          path: [field],
          code: 'asset_not_found',
          message: ASSET_NOT_IN_SITE_MESSAGE,
        }));
      if (issues.length > 0) {
        throw validationFailed(issues);
      }
    }
    return patch;
  }
}
