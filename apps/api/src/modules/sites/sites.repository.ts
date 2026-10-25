import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LEAD_RECIPIENTS_MAX, MAX_SITES_PER_WORKSPACE, type ThemePresetId } from '@plp/contracts';
import type { Model } from 'mongoose';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  type LeadRecipientRecord,
  leadRecipientsOf,
  SITE_MODEL,
  type SitePrivacyRecord,
  type SiteRecord,
  SITES_SUBDOMAIN_INDEX,
} from './site.schema.js';
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

/**
 * The address was added (with how many the site has now), was already there, or the site already
 * has `LEAD_RECIPIENTS_MAX`.
 */
export type AddRecipientOutcome =
  | { kind: 'added'; count: number }
  | { kind: 'exists' }
  | { kind: 'limit_reached' }
  | { kind: 'site_missing' };

/** A new confirmation link of an address: the hash of its secret and when it stops working. */
export interface RecipientInvite {
  tokenHash: string;
  tokenExpiresAt: Date;
}

/** What a background notification needs from a site: its name and confirmed addresses. */
export type NotificationSite = Pick<SiteRecord, '_id' | 'name' | 'leadRecipients'>;

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

  /** In `tx` when given, e.g. publish reads the settings a release snapshots (ADR-015). */
  findById(scope: WorkspaceScope, siteId: ObjectId, tx?: Tx): Promise<SiteRecord | null> {
    return this.sites
      .findOne({ _id: siteId, workspaceId: scope.workspaceId })
      .session(tx ?? null)
      .lean<SiteRecord>()
      .exec();
  }

  /**
   * Sites of the workspace, oldest first. A workspace holds at most `MAX_SITES_PER_WORKSPACE`
   * sites (ADR-014); the read fetches one more so a workspace over the limit fails loudly instead
   * of silently losing sites from the switcher.
   */
  async listForWorkspace(scope: WorkspaceScope): Promise<SiteRecord[]> {
    const sites = await this.sites
      .find({ workspaceId: scope.workspaceId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(MAX_SITES_PER_WORKSPACE + 1)
      .lean<SiteRecord[]>()
      .exec();
    if (sites.length > MAX_SITES_PER_WORKSPACE) {
      throw new Error(
        `Workspace ${scope.workspaceId.toHexString()} holds more than ${MAX_SITES_PER_WORKSPACE} sites (ADR-014)`,
      );
    }
    return sites;
  }

  /** Sites of the workspace, counted inside the site-creation transaction (ADR-014). */
  countForWorkspace(scope: WorkspaceScope, tx: Tx): Promise<number> {
    return this.sites.countDocuments({ workspaceId: scope.workspaceId }, { session: tx }).exec();
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
      pageSeq: 0,
      privacy: null,
      leadRecipients: [],
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

  /** Replaces the personal data settings (ADR-017); null when the site is not in scope. */
  updatePrivacy(
    scope: WorkspaceScope,
    siteId: ObjectId,
    privacy: SitePrivacyRecord,
    tx: Tx,
  ): Promise<SiteRecord | null> {
    return this.sites
      .findOneAndUpdate(
        { _id: siteId, workspaceId: scope.workspaceId },
        { $set: { privacy, updatedAt: privacy.updatedAt } },
        { returnDocument: 'after', session: tx },
      )
      .lean<SiteRecord>()
      .exec();
  }

  /**
   * Adds an address to the site's lead recipients. One conditional update keeps the limit and
   * the uniqueness right when owners add addresses at the same time (ADR-018).
   */
  async addLeadRecipient(
    scope: WorkspaceScope,
    siteId: ObjectId,
    recipient: LeadRecipientRecord,
    tx: Tx,
  ): Promise<AddRecipientOutcome> {
    const updated = await this.sites
      .findOneAndUpdate(
        {
          _id: siteId,
          workspaceId: scope.workspaceId,
          'leadRecipients.email': { $ne: recipient.email },
          [`leadRecipients.${LEAD_RECIPIENTS_MAX - 1}`]: { $exists: false },
        },
        { $push: { leadRecipients: recipient }, $set: { updatedAt: recipient.addedAt } },
        { returnDocument: 'after', projection: { leadRecipients: 1 }, session: tx },
      )
      .lean<Pick<SiteRecord, 'leadRecipients'>>()
      .exec();
    if (updated) {
      return { kind: 'added', count: leadRecipientsOf(updated).length };
    }
    const site = await this.findById(scope, siteId, tx);
    if (!site) {
      return { kind: 'site_missing' };
    }
    return leadRecipientsOf(site).some((item) => item.email === recipient.email)
      ? { kind: 'exists' }
      : { kind: 'limit_reached' };
  }

  /**
   * Removes an address and returns how many the site has left; null when the site or the address
   * is not there.
   */
  async removeLeadRecipient(
    scope: WorkspaceScope,
    siteId: ObjectId,
    recipientId: ObjectId,
    tx: Tx,
  ): Promise<number | null> {
    const updated = await this.sites
      .findOneAndUpdate(
        { _id: siteId, workspaceId: scope.workspaceId, 'leadRecipients._id': recipientId },
        { $pull: { leadRecipients: { _id: recipientId } }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after', projection: { leadRecipients: 1 }, session: tx },
      )
      .lean<Pick<SiteRecord, 'leadRecipients'>>()
      .exec();
    return updated ? leadRecipientsOf(updated).length : null;
  }

  /**
   * Replaces the confirmation link of an address that has not confirmed yet; false when there is
   * no such address. The previous link stops working.
   */
  async renewRecipientInvite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    recipientId: ObjectId,
    invite: RecipientInvite,
  ): Promise<boolean> {
    const result = await this.sites
      .updateOne(
        {
          _id: siteId,
          workspaceId: scope.workspaceId,
          leadRecipients: { $elemMatch: { _id: recipientId, confirmedAt: null } },
        },
        {
          $set: {
            'leadRecipients.$.tokenHash': invite.tokenHash,
            'leadRecipients.$.tokenExpiresAt': invite.tokenExpiresAt,
            'leadRecipients.$.invitedAt': null,
          },
        },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /** Records that the confirmation email of an address went out. */
  async markRecipientInvited(
    scope: WorkspaceScope,
    siteId: ObjectId,
    recipientId: ObjectId,
    invitedAt: Date,
  ): Promise<void> {
    await this.sites
      .updateOne(
        { _id: siteId, workspaceId: scope.workspaceId, 'leadRecipients._id': recipientId },
        { $set: { 'leadRecipients.$.invitedAt': invitedAt } },
      )
      .exec();
  }

  /**
   * Confirms the address whose link secret hashes to `tokenHash`, if the link is still valid.
   * Unscoped: the person confirming has no session. Returns the site name and the address, or
   * null for an unknown, used or expired link. The secret works once.
   */
  async confirmLeadRecipient(
    tokenHash: string,
    now: Date,
  ): Promise<{ siteName: string; email: string } | null> {
    const before = await this.sites
      .findOneAndUpdate(
        { leadRecipients: { $elemMatch: { tokenHash, tokenExpiresAt: { $gt: now } } } },
        {
          $set: {
            'leadRecipients.$.confirmedAt': now,
            'leadRecipients.$.tokenHash': null,
            'leadRecipients.$.tokenExpiresAt': null,
          },
        },
        { returnDocument: 'before', projection: { name: 1, 'leadRecipients.$': 1 } },
      )
      .lean<Pick<SiteRecord, 'name' | 'leadRecipients'>>()
      .exec();
    const recipient = before?.leadRecipients?.[0];
    return before && recipient ? { siteName: before.name, email: recipient.email } : null;
  }

  /**
   * The site of a lead being notified, read by the background sender, which has no member scope;
   * only the name and the addresses.
   */
  findNotificationSite(siteId: ObjectId): Promise<NotificationSite | null> {
    return this.sites
      .findById(siteId, { name: 1, leadRecipients: 1 })
      .lean<NotificationSite>()
      .exec();
  }

  /**
   * Increments `pageSeq` inside a page-creation transaction. The write makes concurrent creations
   * in the site conflict, so the page count read afterwards in the same transaction is exact.
   */
  async recordPageCreation(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<void> {
    const result = await this.sites
      .updateOne(
        { _id: siteId, workspaceId: scope.workspaceId },
        { $inc: { pageSeq: 1 } },
        { session: tx },
      )
      .exec();
    if (result.matchedCount === 0) {
      throw new Error(`Site ${siteId.toHexString()} is not in the workspace of the scope`);
    }
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
