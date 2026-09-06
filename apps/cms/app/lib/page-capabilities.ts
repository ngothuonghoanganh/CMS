import type { TenantPermission } from '@payload/contracts';

/** All page creation entry points create a design-bearing initial document. */
export function canCreateDesignedPage(permissions: readonly TenantPermission[]): boolean {
  return permissions.includes('page.create') && permissions.includes('page.design');
}
