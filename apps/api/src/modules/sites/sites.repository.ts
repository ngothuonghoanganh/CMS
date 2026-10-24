import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ThemePresetId } from '@plp/contracts';
import type { Model } from 'mongoose';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { SITE_MODEL, type SiteRecord, SITES_SUBDOMAIN_INDEX } from './site.schema.js';
import { SUBDOMAIN_TAKEN_MESSAGE } from './subdomain-availability.js';

/** The minimum needed to check access to a site before loading it in a scope. */
export interface SiteAccessRef {
  id: ObjectId;
  workspaceId: ObjectId;
}

export interface CreateSiteInput {
  name: string;
  /** Already validated and lowercased by the contract schema. */
  subdomain: string;
  themePresetId: ThemePresetId;
}

/** Site settings an owner may change; the subdomain is immutable (ADR-011). */
export interface SitePatch {
  name?: string;
  themePresetId?: ThemePresetId;
  logoAssetId?: ObjectId | null;
  defaultShareImageAssetId?: ObjectId | null;
}

@Injectable()
export class SitesRepository {
  constructor(@InjectModel(SITE_MODEL) private readonly sites: Model<SiteRecord>) {}

  /**
   * The only unscoped lookup by id. It returns the owning workspace so the caller can build a
   * scope with `AccessService.scopeFor` before reading the site itself.
   */
  async findAccessRef(siteId: ObjectId): Promise<SiteAccessRef | null> {
    const site = await this.sites
      .findById(siteId, { workspaceId: 1 })
      .lean<Pick<SiteRecord, '_id' | 'workspaceId'>>()
      .exec();
    return site ? { id: site._id, workspaceId: site.workspaceId } : null;
  }

  findById(scope: WorkspaceScope, siteId: ObjectId): Promise<SiteRecord | null> {
    return this.sites
      .findOne({ _id: siteId, workspaceId: scope.workspaceId })
      .lean<SiteRecord>()
      .exec();
  }

  /** Sites of the workspace, oldest first. */
  listForWorkspace(scope: WorkspaceScope): Promise<SiteRecord[]> {
    return this.sites
      .find({ workspaceId: scope.workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<SiteRecord[]>()
      .exec();
  }

  /** Inserts a site created by the scope's user. A duplicate subdomain is 409 `subdomain_taken`. */
  async create(scope: WorkspaceScope, input: CreateSiteInput, tx?: Tx): Promise<SiteRecord> {
    const now = new Date();
    const document = {
      workspaceId: scope.workspaceId,
      name: input.name,
      subdomain: input.subdomain,
      themePresetId: input.themePresetId,
      logoAssetId: null,
      defaultShareImageAssetId: null,
      createdBy: scope.userId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const [site] = await this.sites.create([document], tx ? { session: tx } : {});
      if (!site) {
        throw new Error('Site insert returned no document');
      }
      return site.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, SITES_SUBDOMAIN_INDEX)) {
        throw new AppError(409, 'subdomain_taken', SUBDOMAIN_TAKEN_MESSAGE, {
          issues: [
            { path: ['subdomain'], code: 'subdomain_taken', message: SUBDOMAIN_TAKEN_MESSAGE },
          ],
          cause: error,
        });
      }
      throw error;
    }
  }

  /** Applies a settings patch and returns the updated site, or null when it is not in scope. */
  update(scope: WorkspaceScope, siteId: ObjectId, patch: SitePatch): Promise<SiteRecord | null> {
    return this.sites
      .findOneAndUpdate(
        { _id: siteId, workspaceId: scope.workspaceId },
        { $set: { ...patch, updatedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<SiteRecord>()
      .exec();
  }

  /** Unscoped lookup for public delivery, which resolves a site from the request host. */
  findBySubdomain(subdomain: string): Promise<SiteRecord | null> {
    return this.sites.findOne({ subdomain: subdomain.toLowerCase() }).lean<SiteRecord>().exec();
  }

  async subdomainExists(subdomain: string): Promise<boolean> {
    const site = await this.sites.exists({ subdomain: subdomain.toLowerCase() }).exec();
    return site !== null;
  }
}
