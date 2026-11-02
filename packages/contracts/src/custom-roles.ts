import { z } from 'zod';
import { type AssignableRole, assignableRoleSchema, roleLabels, roleSchema } from './auth.js';
import { idSchema, isoDateTimeSchema } from './common.js';
import { can, type Permission, permissionGroups, permissionSchema } from './permissions.js';

/*
 * Custom roles of a workspace (board 16, ADR-024): cloned from a system role, then permissions
 * switched on or off.
 */

export const CUSTOM_ROLES_MAX = 10;
export const CUSTOM_ROLE_NAME_MAX = 40;

/**
 * The permissions a custom role may switch: the rows of board 16's editor. Running the site or
 * the workspace (settings, domains, consent, members, ownership) stays with Chủ sở hữu and Quản
 * trị, so no custom role can raise anyone's access.
 */
export const customizablePermissionSchema = permissionSchema.extract([
  'pages.edit',
  'templates.manage',
  'pages.publish',
  'pages.requestPublish',
  'pages.manageLive',
  'publishApprovals.decide',
  'leads.view',
  'leads.handle',
  'leads.export',
  'personalData.manage',
]);
export type CustomizablePermission = z.infer<typeof customizablePermissionSchema>;

/** Every custom role views pages. */
export const CUSTOM_ROLE_BASE_PERMISSIONS: readonly Permission[] = ['pages.view'];

/** A custom role where a role is chosen (invite, change access): `custom:{id}`. */
export const customRoleRefSchema = z.templateLiteral(['custom:', idSchema]);
export type CustomRoleRef = z.infer<typeof customRoleRefSchema>;

/** A role as it is given: a system role other than Chủ sở hữu, or a custom role. */
export const roleChoiceSchema = z.union([assignableRoleSchema, customRoleRefSchema]);
export type RoleChoice = AssignableRole | CustomRoleRef;

export function customRoleRef(id: string): CustomRoleRef {
  return `custom:${id}`;
}

/** The custom role's id of a choice, null for a system role. */
export function customRoleIdOf(choice: RoleChoice): string | null {
  return choice.startsWith('custom:') ? choice.slice('custom:'.length) : null;
}

/** The permissions of a system role that a custom role started from it begins with. */
export function customizablePermissionsOf(role: AssignableRole): CustomizablePermission[] {
  return customizablePermissionSchema.options.filter((permission) => can(role, permission));
}

/** Why a set of permissions is not a valid custom role; null when it is (ADR-024). */
export function customRoleProblem(permissions: readonly CustomizablePermission[]): string | null {
  const has = (permission: CustomizablePermission) => permissions.includes(permission);
  if (has('pages.publish') && has('pages.requestPublish')) {
    return 'Chọn xuất bản trực tiếp hoặc gửi yêu cầu, không chọn cả hai';
  }
  if (
    (has('pages.publish') || has('pages.requestPublish') || has('pages.manageLive')) &&
    !has('pages.edit')
  ) {
    return 'Xuất bản, gửi yêu cầu và rollback cần quyền sửa bản nháp';
  }
  if (has('publishApprovals.decide') && !has('pages.publish')) {
    return 'Duyệt yêu cầu xuất bản cần quyền xuất bản';
  }
  if (
    (has('leads.handle') || has('leads.export') || has('personalData.manage')) &&
    !has('leads.view')
  ) {
    return 'Xử lý, xuất lead và dữ liệu cá nhân cần quyền xem lead';
  }
  return null;
}

export const customRoleInputSchema = z
  .object({
    name: z
      .string()
      // One spelling per name: a decomposed "Biên tập" would look like the system role.
      .transform((name) => name.normalize('NFC').trim())
      .pipe(
        z
          .string()
          .min(1, 'Nhập tên vai trò')
          .max(CUSTOM_ROLE_NAME_MAX, `Tên vai trò tối đa ${CUSTOM_ROLE_NAME_MAX} ký tự`)
          .refine(
            (name) =>
              !roleSchema.options.some(
                (role) => roleLabels[role].toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'),
              ),
            'Tên này là tên của một vai trò hệ thống',
          ),
      ),
    /** The system role it was cloned from, for "Thêm" and "Bỏ" on board 16. */
    basedOn: assignableRoleSchema,
    permissions: z
      .array(customizablePermissionSchema)
      .max(customizablePermissionSchema.options.length)
      .refine((items) => new Set(items).size === items.length, 'Mỗi quyền chỉ chọn một lần'),
    /** "Phạm vi khi giao vai trò này": always the whole workspace, or chosen when given. */
    wholeWorkspace: z.boolean(),
  })
  .superRefine((input, context) => {
    const problem = customRoleProblem(input.permissions);
    if (problem !== null) {
      context.addIssue({ code: 'custom', message: problem, path: ['permissions'] });
    }
  });
export type CustomRoleInput = z.infer<typeof customRoleInputSchema>;

export const customRoleSchema = z.object({
  id: idSchema,
  name: z.string(),
  basedOn: assignableRoleSchema,
  permissions: z.array(customizablePermissionSchema),
  wholeWorkspace: z.boolean(),
  /** Members holding it now, and pending invitations offering it. */
  memberCount: z.number().int().nonnegative(),
  invitationCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CustomRole = z.infer<typeof customRoleSchema>;

export const customRoleListResponseSchema = z.object({ items: z.array(customRoleSchema) });
export type CustomRoleListResponse = z.infer<typeof customRoleListResponseSchema>;

/** Everything a holder of the role may do: the permissions chosen and viewing pages. */
export function customRolePermissions(
  permissions: readonly CustomizablePermission[],
): Permission[] {
  return [...CUSTOM_ROLE_BASE_PERMISSIONS, ...permissions];
}

export interface CustomRoleRow {
  permission: CustomizablePermission;
  label: string;
  /** Holders of this row may ask instead: "Yêu cầu" on board 16. */
  request?: CustomizablePermission;
}

/** The editor's groups of board 16: the rows of `permissionGroups` a custom role may switch. */
export const customRoleGroups: readonly { title: string; rows: readonly CustomRoleRow[] }[] =
  permissionGroups.flatMap((group) => {
    const rows = group.rows.flatMap((row): CustomRoleRow[] => {
      const permission = customizablePermissionSchema.safeParse(row.permission);
      if (!permission.success) {
        return [];
      }
      const request =
        row.request === undefined ? null : customizablePermissionSchema.safeParse(row.request);
      return [
        {
          permission: permission.data,
          label: row.label,
          ...(request?.success === true ? { request: request.data } : {}),
        },
      ];
    });
    return rows.length === 0 ? [] : [{ title: group.title, rows }];
  });
