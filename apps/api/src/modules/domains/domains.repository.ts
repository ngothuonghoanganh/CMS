import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CUSTOM_DOMAINS_MAX } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { DOMAIN_MODEL, type DomainCheck, type DomainRecord } from './domain.schema.js';

/** What a check writes back. */
/**
 * What a check stores. `activeSince` and `lostSince` are set by `markSince` only, so two checks of
 * one domain at once never both announce it; `lost: false` clears `lostSince`.
 */
export interface CheckOutcome {
  check: DomainCheck;
  lost: boolean;
  nextCheckAt: Date | null;
}

@Injectable()
export class DomainsRepository {
  constructor(@InjectModel(DOMAIN_MODEL) private readonly domains: Model<DomainRecord>) {}

  /** The site's domains, oldest first; at most `CUSTOM_DOMAINS_MAX`. */
  listForSite(scope: WorkspaceScope, siteId: ObjectId): Promise<DomainRecord[]> {
    return this.domains
      .find({ workspaceId: scope.workspaceId, siteId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(CUSTOM_DOMAINS_MAX + 1)
      .lean<DomainRecord[]>()
      .exec();
  }

  countForSite(scope: WorkspaceScope, siteId: ObjectId, tx?: Tx): Promise<number> {
    return this.domains
      .countDocuments({ workspaceId: scope.workspaceId, siteId }, tx ? { session: tx } : {})
      .exec();
  }

  findForSite(scope: WorkspaceScope, siteId: ObjectId, id: ObjectId): Promise<DomainRecord | null> {
    return this.domains
      .findOne({ _id: id, workspaceId: scope.workspaceId, siteId })
      .lean<DomainRecord>()
      .exec();
  }

  /**
   * Stores a new domain in the caller's transaction. A hostname the site has already fails with
   * `DOMAINS_SITE_HOSTNAME_INDEX`, raised: a write error aborts the transaction, so the caller
   * answers it once the transaction has ended.
   */
  async insert(scope: WorkspaceScope, domain: DomainRecord, tx: Tx): Promise<void> {
    if (!domain.workspaceId.equals(scope.workspaceId)) {
      throw new Error('A domain must belong to the workspace of its scope');
    }
    await this.domains.create([domain], { session: tx });
  }

  /**
   * Removes every domain of a site being deleted, in that transaction (ADR-027): the edge stops
   * getting certificates for them, and another site may verify them.
   */
  async removeForSite(scope: WorkspaceScope, siteId: ObjectId, tx: Tx): Promise<number> {
    const result = await this.domains
      .deleteMany({ workspaceId: scope.workspaceId, siteId }, { session: tx })
      .exec();
    return result.deletedCount;
  }

  async remove(scope: WorkspaceScope, siteId: ObjectId, id: ObjectId, tx: Tx): Promise<boolean> {
    const result = await this.domains
      .deleteOne({ _id: id, workspaceId: scope.workspaceId, siteId }, { session: tx })
      .exec();
    return result.deletedCount === 1;
  }

  /**
   * The site's verified domain about to become its primary address, written in that transaction
   * (`primarySetAt`) so a move or removal at the same moment conflicts; null when it is not the
   * site's verified domain any more.
   */
  holdForPrimary(
    scope: WorkspaceScope,
    siteId: ObjectId,
    id: ObjectId,
    now: Date,
    tx: Tx,
  ): Promise<DomainRecord | null> {
    return this.domains
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, siteId, verifiedAt: { $type: 'date' } },
        { $set: { primarySetAt: now } },
        { new: true, session: tx },
      )
      .lean<DomainRecord>()
      .exec();
  }

  /** Restarts the quick automatic checks, e.g. after "Kiểm tra ngay". */
  async rewatch(id: ObjectId, now: Date): Promise<void> {
    await this.domains.updateOne({ _id: id }, { $set: { watchSince: now } }).exec();
  }

  /**
   * Which of `hostnames` another site owns (verified). Only the names come back: who owns them is
   * never told (board 14).
   */
  async ownedElsewhere(hostnames: readonly string[], siteId: ObjectId): Promise<Set<string>> {
    if (hostnames.length === 0) {
      return new Set();
    }
    const owners = await this.domains
      .find(
        {
          hostname: { $in: [...hostnames] },
          verifiedAt: { $type: 'date' },
          siteId: { $ne: siteId },
        },
        { hostname: 1 },
      )
      .lean<Pick<DomainRecord, 'hostname'>[]>()
      .exec();
    return new Set(owners.map((owner) => owner.hostname));
  }

  // Unscoped: the checks of every site run in the background (ADR-022).

  findById(id: ObjectId): Promise<DomainRecord | null> {
    return this.domains.findById(id).lean<DomainRecord>().exec();
  }

  /**
   * Takes the domain due first, if any, for this instance: its next check moves `leaseMs` ahead,
   * so another instance does not take it meanwhile.
   */
  claimDue(now: Date, leaseMs: number): Promise<DomainRecord | null> {
    return this.domains
      .findOneAndUpdate(
        { nextCheckAt: { $lte: now } },
        { $set: { nextCheckAt: new Date(now.getTime() + leaseMs) } },
        { sort: { nextCheckAt: 1 }, new: true },
      )
      .lean<DomainRecord>()
      .exec();
  }

  async saveCheck(id: ObjectId, outcome: CheckOutcome): Promise<DomainRecord | null> {
    const { lost, ...fields } = outcome;
    return this.domains
      .findOneAndUpdate(
        { _id: id },
        { $set: lost ? fields : { ...fields, lostSince: null } },
        { new: true },
      )
      .lean<DomainRecord>()
      .exec();
  }

  /**
   * What a check saw of DNS, stored before its HTTPS probe: the edge's `ask` reads it, so the
   * certificate of a domain that just started pointing here can be issued during that probe.
   */
  async saveDns(id: ObjectId, seen: Pick<DomainCheck, 'txt' | 'routing' | 'found'>): Promise<void> {
    await this.domains
      .updateOne(
        { _id: id },
        {
          $set: { 'check.txt': seen.txt, 'check.routing': seen.routing, 'check.found': seen.found },
        },
      )
      .exec();
  }

  /** Sets `activeSince` or `lostSince` once; true only for the check that set it. */
  async markSince(id: ObjectId, field: 'activeSince' | 'lostSince', at: Date): Promise<boolean> {
    const result = await this.domains
      .updateOne({ _id: id, [field]: null }, { $set: { [field]: at } })
      .exec();
    return result.modifiedCount === 1;
  }

  /** The verified owner of a hostname, if any. */
  findOwner(hostname: string, tx?: Tx): Promise<DomainRecord | null> {
    return this.domains
      .findOne({ hostname, verifiedAt: { $type: 'date' } })
      .session(tx ?? null)
      .lean<DomainRecord>()
      .exec();
  }

  /** Removes the previous owner of a hostname in the transaction that moves it. */
  async removeInTx(id: ObjectId, tx: Tx): Promise<void> {
    await this.domains.deleteOne({ _id: id }, { session: tx }).exec();
  }

  /**
   * Makes the record the hostname's owner, in the caller's transaction. The partial unique index
   * on verified hostnames refuses a second owner, also when two verifications race.
   */
  async verify(id: ObjectId, now: Date, tx: Tx): Promise<boolean> {
    const result = await this.domains
      .updateOne({ _id: id, verifiedAt: null }, { $set: { verifiedAt: now } }, { session: tx })
      .exec();
    return result.modifiedCount === 1;
  }

  /** A domain that serves pages: verified and pointing here (ADR-022). */
  findServing(hostname: string): Promise<DomainRecord | null> {
    return this.domains
      .findOne({ hostname, verifiedAt: { $type: 'date' }, 'check.routing': 'ok' })
      .lean<DomainRecord>()
      .exec();
  }

  /** Hostnames a site answers on besides its default one, for same-site referrers. */
  async servingHostnames(siteId: ObjectId): Promise<string[]> {
    const domains = await this.domains
      .find({ siteId, verifiedAt: { $type: 'date' } }, { hostname: 1 })
      .limit(CUSTOM_DOMAINS_MAX)
      .lean<Pick<DomainRecord, 'hostname'>[]>()
      .exec();
    return domains.map((domain) => domain.hostname);
  }
}
