import {
  type AssetMimeType,
  assetMimeTypes,
  type Composition,
  type PageGoal,
  pageGoalIds,
  type TemplateIndustry,
  templateIndustries,
  type TemplateSection,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';
import { workspaceCollection } from '../../shared/persistence/workspace-databases.js';
import type { TemplateScopeRecord } from './domain/template-scope.js';

const TEMPLATE_MODEL = 'Template';
const TEMPLATE_VERSION_MODEL = 'TemplateVersion';
export const TEMPLATES_LIST_INDEX = 'templates_list';
export const TEMPLATE_VERSIONS_VERSION_INDEX = 'template_versions_version_unique';

/** A template of the workspace (ADR-030); never deleted: pages made from it keep its id. */
export interface TemplateRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  description: string;
  goal: PageGoal | null;
  industry: TemplateIndustry | null;
  scope: TemplateScopeRecord;
  /** The version pages are made from; versions 1 to this one exist. */
  currentVersion: number;
  /** "Lưu trữ": out of the library until "Khôi phục". */
  archivedAt: Date | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  /** A version saved, the information edited, archived or restored, and by whom. */
  updatedAt: Date;
  updatedBy: Types.ObjectId;
}

/**
 * An image of a version: the template's own copy of an asset of the page it was saved from, under
 * the workspace's storage prefix, so deleting that site leaves it (ADR-030). A page made from the
 * version gets a copy of it as an asset of its own site.
 */
export interface TemplateAssetRecord {
  /** The id the version's composition names the image by; never an asset of a site. */
  assetId: string;
  storageKey: string;
  mimeType: AssetMimeType;
  bytes: number;
  width: number;
  height: number;
  /** The asset's default description, as an asset made from it starts with (ADR-012). */
  alt: string | null;
  decorative: boolean;
}

/** Immutable, like a release (ADR-005): "Dùng lại" makes a new version. */
export interface TemplateVersionRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  templateId: Types.ObjectId;
  version: number;
  /** As the registry parsed it; its images are named by `assets`. */
  composition: Composition;
  /** "Có gì mới trong phiên bản này". */
  note: string;
  /** The page it was saved from, with its title then. */
  source: {
    siteId: Types.ObjectId;
    pageId: Types.ObjectId;
    pageTitle: string;
    kind: 'live' | 'draft';
  };
  /** "Dùng lại vN": the version whose content it took. */
  reusedFrom: number | null;
  assets: TemplateAssetRecord[];
  /** Derived from the composition when saved, so lists never read compositions. */
  sections: TemplateSection[];
  hasForm: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const scopeSchema = new Schema<TemplateScopeRecord>(
  {
    kind: { type: String, enum: ['workspace', 'sites'], required: true },
    siteIds: { type: [Schema.Types.ObjectId], default: undefined },
  },
  { _id: false },
);

const templateSchema = new Schema<TemplateRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    goal: { type: String, enum: [...pageGoalIds, null], default: null },
    industry: { type: String, enum: [...templateIndustries, null], default: null },
    scope: { type: scopeSchema, required: true },
    currentVersion: { type: Number, required: true, min: 1 },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: 'templates', versionKey: false },
);
// Board 19 and the library read every template of the workspace, at most 100 (ADR-030).
templateSchema.index({ workspaceId: 1, updatedAt: -1, _id: -1 }, { name: TEMPLATES_LIST_INDEX });

const templateAssetSchema = new Schema<TemplateAssetRecord>(
  {
    assetId: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, enum: assetMimeTypes, required: true },
    bytes: { type: Number, required: true, min: 1 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    alt: { type: String, default: null },
    decorative: { type: Boolean, required: true },
  },
  { _id: false },
);

const templateVersionSchema = new Schema<TemplateVersionRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    templateId: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, min: 1 },
    composition: { type: Schema.Types.Mixed, required: true },
    note: { type: String, default: '' },
    source: {
      siteId: { type: Schema.Types.ObjectId, required: true },
      pageId: { type: Schema.Types.ObjectId, required: true },
      pageTitle: { type: String, required: true },
      kind: { type: String, enum: ['live', 'draft'], required: true },
    },
    reusedFrom: { type: Number, default: null },
    assets: { type: [templateAssetSchema], default: [] },
    sections: { type: Schema.Types.Mixed, required: true },
    hasForm: { type: Boolean, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  // `minimize: false` keeps empty objects inside compositions exactly as they were saved.
  { collection: 'template_versions', versionKey: false, minimize: false },
);
templateVersionSchema.index(
  { templateId: 1, version: 1 },
  { unique: true, name: TEMPLATE_VERSIONS_VERSION_INDEX },
);

templateVersionSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndReplace',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function () {
    throw new Error('Template versions are immutable (ADR-030): "Dùng lại" makes a new one');
  },
);

/** In the workspace's own database (ADR-025). */
export const TEMPLATE_COLLECTION = workspaceCollection(TEMPLATE_MODEL, templateSchema);
export const TEMPLATE_VERSION_COLLECTION = workspaceCollection(
  TEMPLATE_VERSION_MODEL,
  templateVersionSchema,
);
