import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { LEAD_RECIPIENTS_MAX, MAX_SITES_PER_WORKSPACE, type ThemePresetId } from '@plp/contracts';
import type { Model } from 'mongoose';
import { AppError } from '../../shared/errors.js';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import { newObjectId, type ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  type LeadRecipientRecord,
  leadRecipientsOf,
  SITE_ADDRESS_MODEL,
  SITE_ADDRESSES_SUBDOMAIN_INDEX,
  SITE_COLLECTION,
  type SiteAddressRecord,
  type SitePrimaryDomain,
  type SitePrivacyRecord,
  type SiteRecord,
  sitePrivacyOf,
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
  constructor(
    @InjectModel(SITE_ADDRESS_MODEL) private readonly addresses: Model<SiteAddressRecord>,
    private readonly databases: WorkspaceDatabases,
  ) {}

  /**
   * The only unscoped lookup by id, in the master DB (ADR-025). It returns the owning workspace
   * so the caller can build a scope with `AccessService.scopeFor` before reading the site itself.
   */
  async findAccessRef(siteId: ObjectId): Promise<SiteAccessRef | null> {
    const address = await this.addresses
      .findById(siteId, { workspaceId: 1 })
      .lean<Pick<SiteAddressRecord, '_id' | 'workspaceId'>>()
      .exec();
    return address ? { id: address._id, workspaceId: address.workspaceId } : null;
  }

  /**
   * Names of the sites an invitation gives, for the invitation page (ADR-021). Unscoped: the
   * invited person is not a member yet, and the link is what shows them these sites.
   */
  async findNamesForInvitation(
    invitation: WorkspaceRef,
    siteIds: readonly ObjectId[],
  ): Promise<string[]> {
    const sites = await this.sites(invitation)
      .find({ _id: { $in: [...siteIds] }, workspaceId: invitation.workspaceId }, { name: 1 })
      .sort({ createdAt: 1, _id: 1 })
      .lean<Pick<SiteRecord, '_id' | 'name'>[]>()
      .exec();
    return sites.map((site) => site.name);
  }

  /** In `tx` when given, e.g. publish reads the settings a release snapshots (ADR-015). */
  findById(scope: WorkspaceScope, siteId: ObjectId, tx?: Tx): Promise<SiteRecord | null> {
    return this.sites(scope)
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
    const sites = await this.sites(scope)
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
    return this.sites(scope)
      .countDocuments({ workspaceId: scope.workspaceId }, { session: tx })
      .exec();
  }

  /**
   * Inserts a site created by the scope's user, with its address in the master DB (ADR-025). A
   * subdomain already taken throws the duplicate key of `SITE_ADDRESSES_SUBDOMAIN_INDEX`: inside a
   * transaction the error aborts it, so the caller maps it once the transaction is over
   * (`subdomainTakenError`).
   */
  async create(scope: WorkspaceScope, input: CreateSiteInput, tx: Tx): Promise<SiteRecord> {
    const now = new Date();
    const siteId = newObjectId();
    await this.addresses.create(
      [{ _id: siteId, workspaceId: scope.workspaceId, subdomain: input.subdomain }],
      { session: tx },
    );
    const document = {
      _id: siteId,
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
    const [site] = await this.sites(scope).create([document], { session: tx });
    if (!site) {
      throw new Error('Site insert returned no document');
    }
    return site.toObject();
  }

  /**
   * Removes the site's address from the master DB, in the transaction that deletes the site
   * (ADR-027): its subdomain is free again, and nothing routes to the site. False when it was gone.
   */
  async deleteAddress(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<boolean> {
    const result = await this.addresses
      .deleteOne({ _id: siteId, workspaceId: scope.workspaceId }, { session: tx })
      .exec();
    return result.deletedCount === 1;
  }

  /**
   * Increments `grantSeq` of the sites a grant names, in the transaction that stores the grant.
   * The write conflicts with the deletion of any of them, which removes the address: either the
   * deletion waits and then takes the site out of the stored grant, or the grant finds the site
   * gone. False when one of them is not a site of the workspace any more.
   */
  async holdForGrant(
    scope: WorkspaceScope,
    siteIds: readonly ObjectId[],
    tx: Tx,
  ): Promise<boolean> {
    if (siteIds.length === 0) {
      return true;
    }
    const result = await this.addresses
      .updateMany(
        { _id: { $in: [...siteIds] }, workspaceId: scope.workspaceId },
        { $inc: { grantSeq: 1 } },
        { session: tx },
      )
      .exec();
    // The contract names each site once.
    return result.matchedCount === siteIds.length;
  }

  /** Applies a settings patch and returns the updated site, or null when it is not in scope. */
  update(scope: WorkspaceScope, siteId: ObjectId, patch: SitePatch): Promise<SiteRecord | null> {
    return this.sites(scope)
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
    return this.sites(scope)
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
    const updated = await this.sites(scope)
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
    const updated = await this.sites(scope)
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
    const result = await this.sites(scope)
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
    await this.sites(scope)
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
    site: SiteAccessRef,
    tokenHash: string,
    now: Date,
  ): Promise<{ siteName: string; email: string } | null> {
    const before = await this.sites(site)
      .findOneAndUpdate(
        {
          _id: site.id,
          workspaceId: site.workspaceId,
          leadRecipients: { $elemMatch: { tokenHash, tokenExpiresAt: { $gt: now } } },
        },
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
  findNotificationSite(lead: WorkspaceRef, siteId: ObjectId): Promise<NotificationSite | null> {
    return this.sites(lead)
      .findOne({ _id: siteId, workspaceId: lead.workspaceId }, { name: 1, leadRecipients: 1 })
      .lean<NotificationSite>()
      .exec();
  }

  /**
   * Increments `pageSeq` inside a page-creation transaction. The write makes concurrent creations
   * in the site conflict, so the page count read afterwards in the same transaction is exact.
   */
  async recordPageCreation(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<void> {
    const result = await this.sites(scope)
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

  /** Increments `domainSeq` inside the transaction that adds a custom domain (ADR-022). */
  async recordDomainCreation(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<void> {
    const result = await this.sites(scope)
      .updateOne(
        { _id: siteId, workspaceId: scope.workspaceId },
        { $inc: { domainSeq: 1 } },
        { session: tx },
      )
      .exec();
    if (result.matchedCount === 0) {
      throw new Error(`Site ${siteId.toHexString()} is not in the workspace of the scope`);
    }
  }

  /**
   * Increments `dataSeq` inside a transaction that stores data of the site without otherwise
   * writing the site. The write conflicts with the deletion of the site (ADR-027), so either the
   * deletion waits and deletes the data too, or the data is refused. False when the site is gone:
   * deleted since it was read, its data already swept, so the transaction must store nothing.
   */
  async recordDataWrite(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<boolean> {
    const result = await this.sites(scope)
      .updateOne(
        { _id: siteId, workspaceId: scope.workspaceId },
        { $inc: { dataSeq: 1 } },
        { session: tx },
      )
      .exec();
    return result.matchedCount === 1;
  }

  /**
   * The privacy settings of a site as they are now, for the public lead intake: it reads them
   * again after storing a lead, in case the owner changed the retention period meanwhile. Null
   * when the site was deleted meanwhile (ADR-027).
   */
  async findPublicPrivacy(
    ref: WorkspaceRef,
    siteId: ObjectId,
  ): Promise<{ privacy: SitePrivacyRecord | null } | null> {
    const site = await this.sites(ref)
      .findOne({ _id: siteId, workspaceId: ref.workspaceId }, { privacy: 1 })
      .lean<Pick<SiteRecord, 'privacy'>>()
      .exec();
    return site === null ? null : { privacy: sitePrivacyOf(site) };
  }

  /** Sets or clears the primary custom domain (ADR-022); null when the site is gone. */
  setPrimaryDomain(
    scope: WorkspaceScope,
    siteId: ObjectId,
    primary: SitePrimaryDomain | null,
    tx: Tx,
  ): Promise<SiteRecord | null> {
    return this.sites(scope)
      .findOneAndUpdate(
        { _id: siteId, workspaceId: scope.workspaceId },
        { $set: { primaryDomain: primary, updatedAt: new Date() } },
        { returnDocument: 'after', session: tx },
      )
      .lean<SiteRecord>()
      .exec();
  }

  /**
   * Clears a primary domain that moved to another site, in the transaction of the move. Unscoped:
   * the site losing it is not the caller's (ADR-022).
   */
  async clearPrimaryDomain(
    domain: WorkspaceRef,
    siteId: ObjectId,
    domainId: ObjectId,
    tx: Tx,
  ): Promise<void> {
    await this.sites(domain)
      .updateOne(
        { _id: siteId, workspaceId: domain.workspaceId, 'primaryDomain.domainId': domainId },
        { $set: { primaryDomain: null, updatedAt: new Date() } },
        { session: tx },
      )
      .exec();
  }

  /** Unscoped, for the domain checks: the site's subdomain, to revalidate it. */
  findSubdomain(
    domain: WorkspaceRef,
    siteId: ObjectId,
  ): Promise<Pick<SiteRecord, '_id' | 'subdomain' | 'name' | 'primaryDomain'> | null> {
    return this.sites(domain)
      .findOne(
        { _id: siteId, workspaceId: domain.workspaceId },
        { subdomain: 1, name: 1, primaryDomain: 1 },
      )
      .lean<Pick<SiteRecord, '_id' | 'subdomain' | 'name' | 'primaryDomain'>>()
      .exec();
  }

  /**
   * Unscoped lookup for public delivery, which resolves a site from the request host: the master
   * DB tells the workspace, whose database holds the site (ADR-025).
   */
  async findBySubdomain(subdomain: string): Promise<SiteRecord | null> {
    const address = await this.addresses
      .findOne({ subdomain: subdomain.toLowerCase() })
      .lean<SiteAddressRecord>()
      .exec();
    return address === null
      ? null
      : this.sites(address)
          .findOne({ _id: address._id, workspaceId: address.workspaceId })
          .lean<SiteRecord>()
          .exec();
  }

  async subdomainExists(subdomain: string): Promise<boolean> {
    const address = await this.addresses.exists({ subdomain: subdomain.toLowerCase() }).exec();
    return address !== null;
  }

  private sites(ref: WorkspaceRef): Model<SiteRecord> {
    return this.databases.model(ref, SITE_COLLECTION);
  }
}

/**
 * The 409 for a subdomain another site took meanwhile, from the error of a site-creation
 * transaction; any other error is returned as it is.
 */
export function subdomainTakenError(error: unknown): unknown {
  return isDuplicateKeyError(error, SITE_ADDRESSES_SUBDOMAIN_INDEX)
    ? new AppError(409, 'subdomain_taken', SUBDOMAIN_TAKEN_MESSAGE, {
        issues: [
          { path: ['subdomain'], code: 'subdomain_taken', message: SUBDOMAIN_TAKEN_MESSAGE },
        ],
        cause: error,
      })
    : error;
}
