import {
  type AssignableRole,
  assignableRoleSchema,
  type CustomizablePermission,
  customizablePermissionSchema,
} from '@plp/contracts';
import { Schema, type Types } from 'mongoose';

export const CUSTOM_ROLE_MODEL = 'CustomRole';
export const CUSTOM_ROLE_NAME_INDEX = 'custom_roles_name_unique';

/** A custom role of a workspace (ADR-024). */
export interface CustomRoleRecord {
  _id: Types.ObjectId;
  workspaceId: Types.ObjectId;
  name: string;
  /** The name lowercased: two roles of a workspace never differ only by case. */
  nameKey: string;
  basedOn: AssignableRole;
  /** What it may do besides viewing pages. */
  permissions: CustomizablePermission[];
  wholeWorkspace: boolean;
  /**
   * Grants of the role so far. Every grant increments it in its transaction, so a deletion or a
   * change of scope at the same moment conflicts with the grant instead of missing it.
   */
  grantSeq?: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const customRoleSchema = new Schema<CustomRoleRecord>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    nameKey: { type: String, required: true },
    basedOn: { type: String, enum: assignableRoleSchema.options, required: true },
    permissions: { type: [String], enum: customizablePermissionSchema.options, default: [] },
    wholeWorkspace: { type: Boolean, required: true },
    grantSeq: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'custom_roles', versionKey: false },
);
customRoleSchema.index(
  { workspaceId: 1, nameKey: 1 },
  { unique: true, name: CUSTOM_ROLE_NAME_INDEX },
);

/** The key two names of one workspace may not share. */
export function customRoleNameKey(name: string): string {
  return name.normalize('NFC').trim().toLocaleLowerCase('vi');
}
