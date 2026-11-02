import type { ObjectId } from '../../../shared/persistence/object-id.js';

/**
 * Who may use a workspace template, as stored: every site of the workspace, or the sites listed.
 * A deleted site leaves the list (ADR-027).
 */
export type TemplateScopeRecord = { kind: 'workspace' } | { kind: 'sites'; siteIds: ObjectId[] };

/**
 * Whether a member sees a template (ADR-030): a member of the whole workspace sees every one, to
 * manage it; a member kept to some sites sees those a site of theirs may use.
 */
export function templateVisibleTo(
  scope: TemplateScopeRecord,
  memberSiteIds: readonly ObjectId[] | null,
): boolean {
  if (memberSiteIds === null || scope.kind === 'workspace') {
    return true;
  }
  return scope.siteIds.some((id) => memberSiteIds.some((member) => member.equals(id)));
}

/** Whether a page of the site may be made from the template, or the template applied to one. */
export function templateUsableIn(scope: TemplateScopeRecord, siteId: ObjectId): boolean {
  return scope.kind === 'workspace' || scope.siteIds.some((id) => id.equals(siteId));
}

/**
 * The sites of the template in the library and on board 19: null for the whole workspace. Those
 * the member does not see are left out: a member kept to some sites never learns of the others.
 */
export function visibleSiteIds(
  scope: TemplateScopeRecord,
  memberSiteIds: readonly ObjectId[] | null,
): string[] | null {
  if (scope.kind === 'workspace') {
    return null;
  }
  return scope.siteIds
    .filter((id) => memberSiteIds === null || memberSiteIds.some((member) => member.equals(id)))
    .map((id) => id.toHexString());
}

/**
 * The scope after "Sửa thông tin" or a save by a member: the sites chosen, which must all be the
 * member's, plus the sites of the template the member does not see, which they could neither
 * choose nor clear. Null when a chosen site is not the member's.
 */
export function scopeAfterChange(
  requested: { kind: 'workspace' } | { kind: 'sites'; siteIds: readonly ObjectId[] },
  current: TemplateScopeRecord | null,
  memberSiteIds: readonly ObjectId[] | null,
): TemplateScopeRecord | null {
  if (requested.kind === 'workspace') {
    return { kind: 'workspace' };
  }
  const covers = (id: ObjectId) =>
    memberSiteIds === null || memberSiteIds.some((member) => member.equals(id));
  if (!requested.siteIds.every(covers)) {
    return null;
  }
  const hidden =
    current?.kind === 'sites' ? current.siteIds.filter((id) => !covers(id)) : ([] as ObjectId[]);
  return { kind: 'sites', siteIds: [...requested.siteIds, ...hidden] };
}

/** The scope as the API answers it. */
export function scopeDto(
  scope: TemplateScopeRecord,
  memberSiteIds: readonly ObjectId[] | null,
): { kind: 'workspace' } | { kind: 'sites'; siteIds: string[] } {
  const siteIds = visibleSiteIds(scope, memberSiteIds);
  return siteIds === null ? { kind: 'workspace' } : { kind: 'sites', siteIds };
}
