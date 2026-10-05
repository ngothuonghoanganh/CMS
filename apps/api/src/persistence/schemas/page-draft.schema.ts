import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { PageCompositionV1Schema } from '@payload/contracts';

export type PageDraftDocument = HydratedDocument<PageDraftRecord>;

@Schema({
  collection: 'pageDrafts',
  timestamps: true,
  versionKey: false,
  minimize: false,
})
export class PageDraftRecord {
  @Prop({ type: String, required: true, immutable: true })
  _id!: string;

  @Prop({ type: String, required: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, immutable: true })
  siteId!: string;

  @Prop({ type: String, required: true, immutable: true })
  pageId!: string;

  /** Mutable optimistic-concurrency revision, not PageVersion history. */
  @Prop({ type: Number, required: true, min: 1 })
  versionNumber!: number;

  @Prop({
    type: Object,
    required: true,
    validate: {
      validator: (value: unknown) => PageCompositionV1Schema.safeParse(value).success,
      message: 'composition must be a valid PageCompositionV1',
    },
  })
  composition!: unknown;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PageDraftSchema = SchemaFactory.createForClass(PageDraftRecord);
PageDraftSchema.index({ pageId: 1 }, { unique: true });
PageDraftSchema.index({ workspaceId: 1, siteId: 1, pageId: 1 });
