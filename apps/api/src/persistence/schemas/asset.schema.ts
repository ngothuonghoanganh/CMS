import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AssetDocument = HydratedDocument<AssetRecord>;

@Schema({ collection: 'assets', timestamps: true, versionKey: false })
export class AssetRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 255 })
  filename!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  mimeType!: string;

  @Prop({ type: Number, required: true, min: 0 })
  size!: number;

  @Prop({ type: String, required: true, trim: true, maxlength: 500 })
  storageKey!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AssetSchema = SchemaFactory.createForClass(AssetRecord);
AssetSchema.index({ workspaceId: 1, createdAt: -1 });
