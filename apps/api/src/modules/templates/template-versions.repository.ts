import { Injectable } from '@nestjs/common';
import { MAX_TEMPLATE_VERSIONS } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { TEMPLATE_VERSION_COLLECTION, type TemplateVersionRecord } from './template.schema.js';

export type NewTemplateVersion = Omit<
  TemplateVersionRecord,
  '_id' | 'workspaceId' | 'createdBy' | 'createdAt'
>;

/** A version without its composition: what lists read. */
export type TemplateVersionOutline = Pick<
  TemplateVersionRecord,
  | '_id'
  | 'templateId'
  | 'version'
  | 'note'
  | 'source'
  | 'reusedFrom'
  | 'sections'
  | 'hasForm'
  | 'createdBy'
  | 'createdAt'
>;

const OUTLINE = {
  templateId: 1,
  version: 1,
  note: 1,
  source: 1,
  reusedFrom: 1,
  sections: 1,
  hasForm: 1,
  createdBy: 1,
  createdAt: 1,
} as const;

/**
 * Versions of the workspace's templates. Like releases (ADR-005), they are only inserted and read:
 * the schema refuses every update and delete.
 */
@Injectable()
export class TemplateVersionsRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  async insert(
    scope: WorkspaceScope,
    input: NewTemplateVersion,
    now: Date,
    tx: Tx,
  ): Promise<TemplateVersionRecord> {
    const document = {
      ...input,
      workspaceId: scope.workspaceId,
      createdBy: scope.userId,
      createdAt: now,
    };
    const [version] = await this.versions(scope).create([document], { session: tx });
    if (!version) {
      throw new Error('Template version insert returned no document');
    }
    return version.toObject();
  }

  find(
    scope: WorkspaceScope,
    templateId: ObjectId,
    version: number,
  ): Promise<TemplateVersionRecord | null> {
    return this.versions(scope)
      .findOne({ workspaceId: scope.workspaceId, templateId, version })
      .lean<TemplateVersionRecord>()
      .exec();
  }

  /** Every version of a template, newest first, without compositions (at most 50). */
  listForTemplate(scope: WorkspaceScope, templateId: ObjectId): Promise<TemplateVersionOutline[]> {
    return this.versions(scope)
      .find({ workspaceId: scope.workspaceId, templateId }, OUTLINE)
      .sort({ version: -1 })
      .limit(MAX_TEMPLATE_VERSIONS)
      .lean<TemplateVersionOutline[]>()
      .exec();
  }

  /**
   * The given version of each template, without compositions, in one query, keyed by template id
   * hex: the current versions of the library and of board 19.
   */
  async findOutlines(
    scope: WorkspaceScope,
    versions: readonly { templateId: ObjectId; version: number }[],
  ): Promise<Map<string, TemplateVersionOutline>> {
    if (versions.length === 0) {
      return new Map();
    }
    const found = await this.versions(scope)
      .find(
        {
          workspaceId: scope.workspaceId,
          $or: versions.map(({ templateId, version }) => ({ templateId, version })),
        },
        OUTLINE,
      )
      .lean<TemplateVersionOutline[]>()
      .exec();
    return new Map(found.map((version) => [version.templateId.toHexString(), version]));
  }

  private versions(ref: WorkspaceRef): Model<TemplateVersionRecord> {
    return this.databases.model(ref, TEMPLATE_VERSION_COLLECTION);
  }
}
