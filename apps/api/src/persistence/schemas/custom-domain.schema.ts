import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type CustomDomainDocument = HydratedDocument<CustomDomainRecord>;

@Schema({ collection: 'customDomains', timestamps: true, versionKey: false })
export class CustomDomainRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: false, index: true })
  siteId?: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  hostname!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  normalizedHostname!: string;

  @Prop({ type: String, required: true, trim: true })
  status!: 'pending' | 'verifying' | 'active' | 'failed';

  @Prop({ type: String, required: true, default: 'dns_txt' })
  verificationMethod!: 'dns_txt';

  @Prop({ type: String, required: true, trim: true })
  verificationHostname!: string;

  @Prop({ type: String, required: true, select: false })
  verificationToken!: string;

  @Prop({ type: Date, required: false })
  verifiedAt?: Date;

  @Prop({ type: Date, required: false })
  lastCheckedAt?: Date;

  @Prop({ type: String, required: false, trim: true, maxlength: 500 })
  failureReason?: string;

  @Prop({ type: String, required: false, index: true })
  landingPageId?: string;

  @Prop({ type: Boolean, required: true, default: false })
  isPrimary!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CustomDomainSchema = SchemaFactory.createForClass(CustomDomainRecord);

CustomDomainSchema.index({ normalizedHostname: 1 }, { unique: true });
CustomDomainSchema.index({ workspaceId: 1, createdAt: -1 });
CustomDomainSchema.index({ workspaceId: 1, landingPageId: 1 });
CustomDomainSchema.index({ workspaceId: 1, siteId: 1, createdAt: -1 });
CustomDomainSchema.index(
  { workspaceId: 1, siteId: 1, isPrimary: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true, siteId: { $type: 'string' } },
  },
);
CustomDomainSchema.index(
  { workspaceId: 1, landingPageId: 1, isPrimary: 1 },
  {
    unique: true,
    partialFilterExpression: { isPrimary: true, landingPageId: { $type: 'string' } },
  },
);
