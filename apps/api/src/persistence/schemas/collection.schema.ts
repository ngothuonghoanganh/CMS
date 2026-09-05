import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  CollectionDefinitionSchema,
  CollectionEntryVersionSchema as CollectionEntryVersionContractSchema,
} from '@payload/contracts';

export type CollectionDocument = HydratedDocument<CollectionRecord>;
export type CollectionEntryDocument = HydratedDocument<CollectionEntryRecord>;
export type CollectionEntryVersionDocument =
  HydratedDocument<CollectionEntryVersionRecord>;

@Schema({
  collection: 'collectionDefinitions',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class CollectionRecord {
  @Prop({ type: String, required: true, immutable: true }) _id!: string;
  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;
  @Prop({ type: String, required: true, index: true, immutable: true }) siteId!: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 100 }) key!: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 200 }) name!: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  singularName!: string;
  @Prop({ type: String, required: false, trim: true, maxlength: 1000 })
  description?: string;
  @Prop({
    type: [Object],
    required: true,
    default: [],
    validate: {
      validator: (value: unknown) => Array.isArray(value) && value.length <= 100,
    },
  })
  fields!: unknown[];
  @Prop({ type: String, required: false }) titleFieldKey?: string;
  @Prop({ type: String, required: true, enum: ['active', 'archived'], default: 'active' })
  status!: 'active' | 'archived';
  @Prop({ type: Number, required: true, min: 1, default: 1 }) schemaVersion!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectionSchema = SchemaFactory.createForClass(CollectionRecord);
CollectionSchema.index({ siteId: 1, key: 1 }, { unique: true });
CollectionSchema.index({ workspaceId: 1, siteId: 1, status: 1 });
CollectionSchema.path('fields').validate(
  (value: unknown) => CollectionDefinitionSchema.shape.fields.safeParse(value).success,
  'fields must be valid collection field definitions',
);

@Schema({ collection: 'collectionEntries', timestamps: true, versionKey: false })
export class CollectionEntryRecord {
  @Prop({ type: String, required: true, immutable: true }) _id!: string;
  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;
  @Prop({ type: String, required: true, index: true, immutable: true }) siteId!: string;
  @Prop({ type: String, required: true, index: true, immutable: true })
  collectionId!: string;
  @Prop({ type: String, required: false, index: true }) draftVersionId?: string;
  @Prop({ type: String, required: false, index: true }) publishedVersionId?: string;
  @Prop({
    type: String,
    required: true,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
  })
  status!: 'draft' | 'published' | 'archived';
  createdAt!: Date;
  updatedAt!: Date;
}

export const CollectionEntrySchema = SchemaFactory.createForClass(CollectionEntryRecord);
CollectionEntrySchema.index({ collectionId: 1, createdAt: -1 });
CollectionEntrySchema.index({ siteId: 1, collectionId: 1, status: 1 });

@Schema({
  collection: 'collectionEntryVersions',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  minimize: false,
})
export class CollectionEntryVersionRecord {
  @Prop({ type: String, required: true, immutable: true }) _id!: string;
  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;
  @Prop({ type: String, required: true, index: true, immutable: true }) siteId!: string;
  @Prop({ type: String, required: true, index: true, immutable: true }) entryId!: string;
  @Prop({ type: String, required: true, index: true, immutable: true })
  collectionId!: string;
  @Prop({ type: Number, required: true, min: 1, immutable: true }) versionNumber!: number;
  @Prop({ type: Object, required: true, immutable: true }) values!: Record<
    string,
    unknown
  >;
  @Prop({ type: String, required: false, immutable: true, maxlength: 320 })
  createdBy?: string;
  createdAt!: Date;
}

export const CollectionEntryVersionSchema = SchemaFactory.createForClass(
  CollectionEntryVersionRecord,
);
CollectionEntryVersionSchema.index({ entryId: 1, versionNumber: 1 }, { unique: true });
CollectionEntryVersionSchema.index({ collectionId: 1, createdAt: -1 });
CollectionEntryVersionSchema.path('values').validate(
  (value: unknown) =>
    CollectionEntryVersionContractSchema.shape.values.safeParse(value).success,
  'values must be a record',
);

// Keep schema validators independent from Mongo documents and avoid accepting
// arrays or primitive values as an entry value bag.
