import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { NavigationItemsSchema } from '@payload/contracts';

export type NavigationDocument = HydratedDocument<NavigationRecord>;

/**
 * A Navigation is pure menu data. It has no draft/published lifecycle, no
 * layout and no renderer of its own; the `navigation-view` component binds a
 * menu by key and renders it wherever the user places that component.
 */
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

  /** Legacy site scope. New navigation records are workspace-owned. */
  @Prop({ type: String, required: false, index: true })
  siteId?: string;

  @Prop({ type: String, required: false, enum: ['workspace', 'site'], index: true })
  ownershipScope?: 'workspace' | 'site';

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  key!: string;

  /** Migration provenance for deterministic compatibility copies. */
  @Prop({ type: String, required: false, index: true, immutable: true })
  migrationSourceId?: string;

  @Prop({ type: String, required: false, immutable: true })
  migrationId?: string;

  @Prop({
    type: [Object],
    required: true,
    default: [],
    validate: {
      validator: (value: unknown) => NavigationItemsSchema.safeParse(value).success,
      message: 'items must be valid navigation items',
    },
  })
  items!: unknown[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const NavigationSchemaMongoose = SchemaFactory.createForClass(NavigationRecord);
NavigationSchemaMongoose.index(
  { workspaceId: 1, siteId: 1, key: 1 },
  {
    name: 'navigation_legacy_workspace_site_key_unique',
    unique: true,
    partialFilterExpression: { siteId: { $exists: true } },
  },
);
NavigationSchemaMongoose.index(
  { workspaceId: 1, key: 1 },
  {
    name: 'navigation_workspace_key_unique',
    unique: true,
    partialFilterExpression: { ownershipScope: 'workspace' },
  },
);
NavigationSchemaMongoose.index({ workspaceId: 1, siteId: 1, createdAt: -1 });
