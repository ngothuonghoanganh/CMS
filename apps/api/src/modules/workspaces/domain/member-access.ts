import { type Access, customRolePermissions } from '@plp/contracts';
import type { ObjectId } from '../../../shared/persistence/object-id.js';
import type { CustomRoleRecord } from '../custom-role.schema.js';
import type { StoredRole } from '../workspace.schema.js';

/** An id no custom role has: the access of a membership whose role is gone. */
const MISSING_ROLE_ID = '000000000000000000000000';

/**
 * What a membership or an invitation may do (ADR-024): its system role, or its custom role's
 * permissions. A custom role that cannot be found grants nothing.
 */
export function accessOf(
  holder: { role: StoredRole; customRoleId?: ObjectId | null },
  roles: ReadonlyMap<string, Pick<CustomRoleRecord, '_id' | 'name' | 'permissions'>>,
): Access {
  if (holder.role !== 'custom') {
    return holder.role;
  }
  const role = holder.customRoleId ? roles.get(holder.customRoleId.toHexString()) : undefined;
  return role
    ? {
        customRoleId: role._id.toHexString(),
        name: role.name,
        permissions: customRolePermissions(role.permissions),
      }
    : {
        customRoleId: holder.customRoleId?.toHexString() ?? MISSING_ROLE_ID,
        name: 'Vai trò đã xóa',
        permissions: [],
      };
}
