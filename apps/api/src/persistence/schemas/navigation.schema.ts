import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { NavigationSchema } from '@payload/contracts';

export type NavigationDocument = HydratedDocument<NavigationRecord>;

@Schema({
  collection: 'navigations',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class NavigationRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true })
  siteId!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  key!: string;

  @Prop({
    type: [Object],
    required: true,
    default: [],
    validate: {
      validator: (value: unknown) =>
        NavigationSchema.shape.items.safeParse(value).success,
      message: 'items must be valid navigation items',
    },
  })
  items!: unknown[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const NavigationSchemaMongoose = SchemaFactory.createForClass(NavigationRecord);
NavigationSchemaMongoose.index({ siteId: 1, key: 1 }, { unique: true });
NavigationSchemaMongoose.index({ workspaceId: 1, siteId: 1, createdAt: -1 });
