import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

export type FormSubmissionValue = string | boolean;
export type FormSubmissionDocument = HydratedDocument<FormSubmissionRecord>;

@Schema({ _id: false, versionKey: false })
export class FormSubmissionValueRecord {
  @Prop({ type: String, required: true })
  fieldId!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value!: FormSubmissionValue;
}

@Schema({ collection: 'formSubmissions', timestamps: true, versionKey: false })
export class FormSubmissionRecord {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  workspaceId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  siteId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  landingPageId!: string;

  @Prop({ type: String, required: true, index: true, immutable: true })
  pageVersionId!: string;

  @Prop({ type: String, required: true, immutable: true })
  formNodeId!: string;

  @Prop({ type: [FormSubmissionValueRecord], required: true, immutable: true })
  values!: FormSubmissionValueRecord[];

  @Prop({
    type: String,
    enum: ['new', 'read', 'archived'],
    required: true,
    default: 'new',
  })
  status!: 'new' | 'read' | 'archived';

  @Prop({ type: Date, required: true, immutable: true })
  submittedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FormSubmissionSchema = SchemaFactory.createForClass(FormSubmissionRecord);
FormSubmissionSchema.index({ workspaceId: 1, createdAt: -1 });
FormSubmissionSchema.index({ landingPageId: 1, createdAt: -1 });
FormSubmissionSchema.index({ status: 1, createdAt: -1 });
