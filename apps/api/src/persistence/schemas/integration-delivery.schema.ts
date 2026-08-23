import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type IntegrationDeliveryDocument = HydratedDocument<IntegrationDeliveryRecord>;

@Schema({ collection: 'integrationDeliveries', timestamps: true, versionKey: false })
export class IntegrationDeliveryRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  submissionId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  integrationId!: string;

  @Prop({ type: String, required: true, immutable: true })
  integrationName!: string;

  @Prop({ type: String, required: true, enum: ['email', 'webhook'], immutable: true })
  integrationType!: 'email' | 'webhook';

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'processing', 'delivered', 'failed'],
    default: 'pending',
    index: true,
  })
  status!: 'pending' | 'processing' | 'delivered' | 'failed';

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  attemptCount!: number;

  @Prop({ type: Date, required: false })
  lastAttemptAt?: Date;

  @Prop({ type: Date, required: false })
  nextAttemptAt?: Date;

  @Prop({ type: Date, required: false })
  processingLeaseUntil?: Date;

  @Prop({ type: String, required: false, maxlength: 500 })
  lastError?: string;

  @Prop({ type: Date, required: false })
  deliveredAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const IntegrationDeliverySchema = SchemaFactory.createForClass(
  IntegrationDeliveryRecord,
);
IntegrationDeliverySchema.index({ submissionId: 1, integrationId: 1 }, { unique: true });
IntegrationDeliverySchema.index({ workspaceId: 1, status: 1, nextAttemptAt: 1 });
