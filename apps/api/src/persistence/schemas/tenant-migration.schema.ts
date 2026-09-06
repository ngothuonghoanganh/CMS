import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TenantMigrationStatus = 'running' | 'complete' | 'blocked';
export type TenantMigrationDocument = HydratedDocument<TenantMigrationRecord>;

@Schema({ collection: 'tenantMigrations', timestamps: true, versionKey: false })
export class TenantMigrationRecord {
  /** The stable migration identifier is also the document id. */
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, enum: ['running', 'complete', 'blocked'], required: true })
  status!: TenantMigrationStatus;

  @Prop({ type: Date, required: false })
  completedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const TenantMigrationSchema = SchemaFactory.createForClass(TenantMigrationRecord);
