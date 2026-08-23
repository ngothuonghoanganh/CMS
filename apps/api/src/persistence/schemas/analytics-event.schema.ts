import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import { env } from '../../config/env';

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEventRecord>;

@Schema({ collection: 'analyticsEvents', versionKey: false, minimize: true })
export class AnalyticsEventRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  siteId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  landingPageId!: string;

  @Prop({ type: String, required: true, immutable: true })
  pageVersionId!: string;

  @Prop({ type: Number, required: true, enum: [1], immutable: true })
  eventVersion!: 1;

  @Prop({
    type: String,
    required: true,
    enum: ['page.viewed', 'form.submitted', 'element.clicked'],
    index: true,
    immutable: true,
  })
  eventType!: 'page.viewed' | 'form.submitted' | 'element.clicked';

  @Prop({ type: Number, required: true, immutable: true })
  publishedVersionNumber!: number;

  @Prop({ type: String, required: false, immutable: true })
  nodeId?: string;

  @Prop({ type: String, required: false, immutable: true })
  elementType?: string;

  @Prop({ type: String, required: false, immutable: true })
  formSubmissionId?: string;

  @Prop({ type: String, required: false, immutable: true })
  sessionId?: string;

  @Prop({ type: Date, required: true, index: true, immutable: true })
  occurredAt!: Date;

  @Prop({ type: Date, required: true, immutable: true })
  receivedAt!: Date;

  // Only the sanitized hostname is stored. Raw referrer URLs, IPs and user
  // agents intentionally have no fields in this schema.
  @Prop({ type: String, required: false, maxlength: 253, immutable: true })
  referrerHost?: string;

  @Prop({ type: String, required: false, maxlength: 100, immutable: true })
  utmSource?: string;

  @Prop({ type: String, required: false, maxlength: 100, immutable: true })
  utmMedium?: string;

  @Prop({ type: String, required: false, maxlength: 100, immutable: true })
  utmCampaign?: string;

  @Prop({ type: String, required: false, maxlength: 100, immutable: true })
  utmTerm?: string;

  @Prop({ type: String, required: false, maxlength: 100, immutable: true })
  utmContent?: string;

  @Prop({
    type: String,
    required: false,
    enum: ['desktop', 'mobile', 'tablet', 'unknown'],
    immutable: true,
  })
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEventRecord);
AnalyticsEventSchema.index({ workspaceId: 1, receivedAt: -1 });
AnalyticsEventSchema.index({ landingPageId: 1, eventType: 1, receivedAt: -1 });
AnalyticsEventSchema.index({ landingPageId: 1, sessionId: 1, receivedAt: -1 });
AnalyticsEventSchema.index(
  { receivedAt: 1 },
  { expireAfterSeconds: env.ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 },
);
