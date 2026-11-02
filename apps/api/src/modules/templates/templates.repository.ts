import { Injectable } from '@nestjs/common';
import { MAX_WORKSPACE_TEMPLATES, type PageGoal, type TemplateIndustry } from '@plp/contracts';
import type { Model } from 'mongoose';
import type { ObjectId } from '../../shared/persistence/object-id.js';
import type { Tx } from '../../shared/persistence/transaction.js';
import {
  WorkspaceDatabases,
  type WorkspaceRef,
} from '../../shared/persistence/workspace-databases.js';
import type { WorkspaceScope } from '../workspaces/workspace-scope.js';
import { type TemplateScopeRecord, templateVisibleTo } from './domain/template-scope.js';
import { TEMPLATE_COLLECTION, type TemplateRecord } from './template.schema.js';

/** What "Sửa thông tin" changes, and what a new template starts with. */
export interface TemplateInfo {
  name: string;
  description: string;
  goal: PageGoal | null;
  industry: TemplateIndustry | null;
  scope: TemplateScopeRecord;
}

/** The workspace's templates (ADR-030). Every call needs a scope; nothing deletes one. */
@Injectable()
export class TemplatesRepository {
  constructor(private readonly databases: WorkspaceDatabases) {}

  /**
   * Every template of the workspace, last changed first. At most `MAX_WORKSPACE_TEMPLATES`, which
   * creation enforces; one more fails loudly instead of leaving one out.
   */
  async listForWorkspace(scope: WorkspaceScope): Promise<TemplateRecord[]> {
    const templates = await this.templates(scope)
      .find({ workspaceId: scope.workspaceId })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(MAX_WORKSPACE_TEMPLATES + 1)
      .lean<TemplateRecord[]>()
      .exec();
    if (templates.length > MAX_WORKSPACE_TEMPLATES) {
      throw new Error(
        `Workspace ${scope.workspaceId.toHexString()} holds more than ${MAX_WORKSPACE_TEMPLATES} templates (ADR-030)`,
      );
    }
    return templates;
  }

  findById(scope: WorkspaceScope, id: ObjectId, tx?: Tx): Promise<TemplateRecord | null> {
    return this.templates(scope)
      .findOne({ _id: id, workspaceId: scope.workspaceId })
      .session(tx ?? null)
      .lean<TemplateRecord>()
      .exec();
  }

  /**
   * The template when the member sees it (`templateVisibleTo`); null otherwise, so a template
   * of no site of theirs is answered like one that does not exist (ADR-020).
   */
  async findVisible(scope: WorkspaceScope, id: ObjectId): Promise<TemplateRecord | null> {
    const template = await this.findById(scope, id);
    return template !== null && templateVisibleTo(template.scope, scope.siteIds) ? template : null;
  }

  /** Templates of the workspace, archived ones too; creation counts in its transaction. */
  countForWorkspace(scope: WorkspaceScope, tx: Tx): Promise<number> {
    return this.templates(scope)
      .countDocuments({ workspaceId: scope.workspaceId })
      .session(tx)
      .exec();
  }

  /** A new template at version 1, by the scope's user. */
  async create(
    scope: WorkspaceScope,
    input: { id: ObjectId; info: TemplateInfo; now: Date },
    tx: Tx,
  ): Promise<TemplateRecord> {
    const document = {
      _id: input.id,
      workspaceId: scope.workspaceId,
      ...input.info,
      currentVersion: 1,
      archivedAt: null,
      createdBy: scope.userId,
      createdAt: input.now,
      updatedAt: input.now,
      updatedBy: scope.userId,
    };
    const [template] = await this.templates(scope).create([document], { session: tx });
    if (!template) {
      throw new Error('Template insert returned no document');
    }
    return template.toObject();
  }

  /**
   * Moves the template to its next version, only while `baseVersion` is still its current one:
   * two saves at once never make the same version. Null when it moved on (or is gone).
   */
  advanceVersion(
    scope: WorkspaceScope,
    id: ObjectId,
    baseVersion: number,
    change: { name?: string; now: Date },
    tx: Tx,
  ): Promise<TemplateRecord | null> {
    return this.templates(scope)
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId, currentVersion: baseVersion },
        {
          $inc: { currentVersion: 1 },
          $set: {
            ...(change.name === undefined ? {} : { name: change.name }),
            updatedAt: change.now,
            updatedBy: scope.userId,
          },
        },
        { returnDocument: 'after', session: tx },
      )
      .lean<TemplateRecord>()
      .exec();
  }

  /** "Sửa thông tin". Null when the template is gone. */
  updateInfo(
    scope: WorkspaceScope,
    id: ObjectId,
    info: TemplateInfo,
    now: Date,
  ): Promise<TemplateRecord | null> {
    return this.templates(scope)
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId },
        { $set: { ...info, updatedAt: now, updatedBy: scope.userId } },
        { returnDocument: 'after' },
      )
      .lean<TemplateRecord>()
      .exec();
  }

  /** "Lưu trữ" (a date) or "Khôi phục" (null). Null when the template is gone. */
  setArchived(
    scope: WorkspaceScope,
    id: ObjectId,
    archivedAt: Date | null,
    now: Date,
  ): Promise<TemplateRecord | null> {
    return this.templates(scope)
      .findOneAndUpdate(
        { _id: id, workspaceId: scope.workspaceId },
        { $set: { archivedAt, updatedAt: now, updatedBy: scope.userId } },
        { returnDocument: 'after' },
      )
      .lean<TemplateRecord>()
      .exec();
  }

  private templates(ref: WorkspaceRef): Model<TemplateRecord> {
    return this.databases.model(ref, TEMPLATE_COLLECTION);
  }
}
