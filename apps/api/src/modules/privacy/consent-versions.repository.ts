import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../../shared/persistence/duplicate-key.js';
import {
  afterCursor,
  type KeysetPage,
  NEWEST_FIRST,
  toKeysetPage,
} from '../../shared/persistence/keyset.js';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import {
  CONSENT_VERSION_MODEL,
  type ConsentVersionRecord,
  CONSENT_VERSIONS_SITE_VERSION_INDEX,
} from './consent-version.schema.js';

export interface InsertConsentVersionInput {
  siteId: ObjectId;
  version: number;
  requiredText: string;
  marketingText: string | null;
}

/** Another request saved this version number first. */
export class ConsentVersionTakenError extends Error {
  constructor(options: { cause: unknown }) {
    super('This consent version already exists', options);
    this.name = 'ConsentVersionTakenError';
  }
}

/** Consent versions are immutable (ADR-017): this repository only inserts and reads. */
@Injectable()
export class ConsentVersionsRepository {
  constructor(
    @InjectModel(CONSENT_VERSION_MODEL) private readonly versions: Model<ConsentVersionRecord>,
  ) {}

  async insert(
    scope: WorkspaceScope,
    input: InsertConsentVersionInput,
    tx: Tx,
  ): Promise<ConsentVersionRecord> {
    const document = {
      workspaceId: scope.workspaceId,
      ...input,
      createdBy: scope.userId,
      createdAt: new Date(),
    };
    try {
      const [created] = await this.versions.create([document], { session: tx });
      if (!created) {
        throw new Error('Consent version insert returned no document');
      }
      return created.toObject();
    } catch (error) {
      if (isDuplicateKeyError(error, CONSENT_VERSIONS_SITE_VERSION_INDEX)) {
        throw new ConsentVersionTakenError({ cause: error });
      }
      throw error;
    }
  }

  /** The latest version of the site, the one forms show; in `tx` when publish snapshots it. */
  findCurrent(
    scope: WorkspaceScope,
    siteId: ObjectId,
    tx?: Tx,
  ): Promise<ConsentVersionRecord | null> {
    return this.versions
      .findOne({ siteId, workspaceId: scope.workspaceId })
      .sort({ version: -1 })
      .session(tx ?? null)
      .lean<ConsentVersionRecord>()
      .exec();
  }

  /**
   * The latest version for a public read (a draft preview, ADR-017): no member scope, bound to the
   * site the preview token names.
   */
  findPublicCurrent(siteId: ObjectId): Promise<ConsentVersionRecord | null> {
    return this.versions
      .findOne({ siteId })
      .sort({ version: -1 })
      .lean<ConsentVersionRecord>()
      .exec();
  }

  /** Versions of the site, newest first. */
  async listForSite(
    scope: WorkspaceScope,
    siteId: ObjectId,
    cursor: string | undefined,
    limit: number,
  ): Promise<KeysetPage<ConsentVersionRecord>> {
    const records = await this.versions
      .find({ siteId, workspaceId: scope.workspaceId, ...afterCursor(cursor) })
      .sort(NEWEST_FIRST)
      .limit(limit + 1)
      .lean<ConsentVersionRecord[]>()
      .exec();
    return toKeysetPage(records, limit);
  }
}
