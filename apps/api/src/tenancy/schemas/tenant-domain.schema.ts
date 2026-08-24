import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantDomainKind = 'public' | 'cms';
export type TenantDomainDocument = HydratedDocument<TenantDomainRecord>;

@Schema({ collection: 'tenantDomains', timestamps: true, versionKey: false })
export class TenantDomainRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  tenantId!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true })
  hostname!: string;

  @Prop({ type: String, enum: ['public', 'cms'], required: true, default: 'public' })
  kind!: TenantDomainKind;

  @Prop({ type: String, enum: ['active', 'disabled'], required: true, default: 'active' })
  status!: 'active' | 'disabled';

  @Prop({ type: String, required: false })
  sourceDomainId?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantDomainSchema = SchemaFactory.createForClass(TenantDomainRecord);
TenantDomainSchema.index({ hostname: 1 }, { unique: true });
TenantDomainSchema.index({ tenantId: 1, kind: 1, status: 1 });
