import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PublicSiteRouteDocument = HydratedDocument<PublicSiteRouteRecord>;

/**
 * Control-plane authority for platform-hostname public routing.
 *
 * A tenant-local Site slug is not enough to route `/:siteSlug/*path`: the
 * request must select its tenant database before any Site query runs.
 */
@Schema({ collection: 'publicSiteRoutes', timestamps: true, versionKey: false })
export class PublicSiteRouteRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  siteSlug!: string;

  @Prop({ type: String, required: true, index: true })
  tenantId!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  tenantSlug!: string;

  @Prop({ type: String, required: true })
  databaseKey!: string;

  @Prop({ type: String, required: true })
  workspaceId!: string;

  @Prop({ type: String, required: true })
  siteId!: string;

  @Prop({ type: String, enum: ['active', 'disabled'], required: true, default: 'active' })
  status!: 'active' | 'disabled';

  createdAt!: Date;
  updatedAt!: Date;
}

export const PublicSiteRouteSchema = SchemaFactory.createForClass(PublicSiteRouteRecord);
PublicSiteRouteSchema.index({ siteSlug: 1 }, { unique: true });
PublicSiteRouteSchema.index({ tenantId: 1, siteId: 1 }, { unique: true });
PublicSiteRouteSchema.index({ status: 1, siteSlug: 1 });
