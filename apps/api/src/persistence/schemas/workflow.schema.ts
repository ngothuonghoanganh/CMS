import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type WorkflowDocument = HydratedDocument<WorkflowRecord>;
export type WorkflowVersionDocument = HydratedDocument<WorkflowVersionRecord>;
export type WorkflowExecutionDocument = HydratedDocument<WorkflowExecutionRecord>;
export type WorkflowStepExecutionDocument = HydratedDocument<WorkflowStepExecutionRecord>;

@Schema({ collection: 'workflows', timestamps: true, versionKey: false, minimize: false })
export class WorkflowRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  name!: string;

  @Prop({ type: String, required: false, maxlength: 1_000 })
  description?: string;

  @Prop({
    type: String,
    required: true,
    enum: ['tenant', 'workspace', 'page'],
    index: true,
  })
  scope!: 'tenant' | 'workspace' | 'page';

  @Prop({ type: String, required: false, index: true })
  workspaceId?: string;

  @Prop({ type: String, required: false, index: true })
  pageId?: string;

  @Prop({ type: Boolean, required: true, default: false, index: true })
  enabled!: boolean;

  @Prop({ type: String, required: false })
  draftVersionId?: string;

  @Prop({ type: String, required: false })
  publishedVersionId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

@Schema({
  collection: 'workflowVersions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class WorkflowVersionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workflowId!: string;

  @Prop({ type: Number, required: true, min: 1, immutable: true })
  versionNumber!: number;

  @Prop({ type: String, required: true, enum: ['draft', 'published'], index: true })
  status!: 'draft' | 'published';

  @Prop({ type: Object, required: true })
  definition!: Record<string, unknown>;

  @Prop({ type: String, required: false, maxlength: 320 })
  createdBy?: string;

  @Prop({ type: Date, required: false })
  publishedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

@Schema({
  collection: 'workflowExecutions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class WorkflowExecutionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workflowId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workflowVersionId!: string;

  @Prop({ type: String, required: false, index: true, immutable: true })
  workspaceId?: string;

  @Prop({ type: String, required: false, index: true, immutable: true })
  pageId?: string;

  @Prop({ type: String, required: true, index: true })
  status!: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

  @Prop({ type: String, required: true, immutable: true })
  triggerType!: string;

  @Prop({ type: String, required: false, index: true, immutable: true })
  triggerEventId?: string;

  @Prop({ type: Object, required: true, immutable: true })
  triggerPayload!: Record<string, unknown>;

  @Prop({ type: Object, required: true, default: {}, immutable: true })
  variables!: Record<string, unknown>;

  @Prop({ type: String, required: false, index: true, immutable: true })
  correlationId?: string;

  @Prop({ type: String, required: false, index: true, immutable: true })
  rootExecutionId?: string;

  @Prop({ type: Date, required: false })
  startedAt?: Date;

  @Prop({ type: Date, required: false })
  completedAt?: Date;

  @Prop({ type: Date, required: false, index: true })
  nextRunAt?: Date;

  @Prop({ type: Object, required: false })
  error?: { code: string; message: string; retryable: boolean };

  createdAt!: Date;
  updatedAt!: Date;
}

@Schema({
  collection: 'workflowStepExecutions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class WorkflowStepExecutionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  executionId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  nodeId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'running', 'success', 'failed', 'skipped'],
  })
  status!: 'pending' | 'running' | 'success' | 'failed' | 'skipped';

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  attempt!: number;

  @Prop({ type: Date, required: false })
  startedAt?: Date;

  @Prop({ type: Date, required: false })
  completedAt?: Date;

  @Prop({ type: Object, required: false })
  output?: unknown;

  @Prop({ type: Object, required: false })
  error?: { code: string; message: string; retryable: boolean };

  createdAt!: Date;
  updatedAt!: Date;
}

export const WorkflowSchema = SchemaFactory.createForClass(WorkflowRecord);
export const WorkflowVersionSchema = SchemaFactory.createForClass(WorkflowVersionRecord);
export const WorkflowExecutionSchema = SchemaFactory.createForClass(
  WorkflowExecutionRecord,
);
export const WorkflowStepExecutionSchema = SchemaFactory.createForClass(
  WorkflowStepExecutionRecord,
);

WorkflowSchema.index({ scope: 1, workspaceId: 1, pageId: 1, createdAt: -1 });
WorkflowVersionSchema.index({ workflowId: 1, versionNumber: 1 }, { unique: true });
WorkflowExecutionSchema.index(
  { workflowVersionId: 1, triggerEventId: 1 },
  { unique: true, partialFilterExpression: { triggerEventId: { $type: 'string' } } },
);
WorkflowExecutionSchema.index({ workflowId: 1, createdAt: -1 });
WorkflowExecutionSchema.index({ status: 1, nextRunAt: 1 });
WorkflowStepExecutionSchema.index({ executionId: 1, nodeId: 1 }, { unique: true });
