import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AssetFolderDocument = HydratedDocument<AssetFolderRecord>;

@Schema({ collection: 'assetFolders', timestamps: true, versionKey: false })
export class AssetFolderRecord {
  @Prop({ type: String, required: true }) _id!: string;
  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 160 }) name!: string;
  @Prop({ type: String, required: false, index: true }) parentId?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const AssetFolderSchema = SchemaFactory.createForClass(AssetFolderRecord);
AssetFolderSchema.index({ workspaceId: 1, parentId: 1, name: 1 }, { unique: true });
