import {
  type Access,
  can,
  holdersOf,
  type Site,
  type TemplateScope,
  type TemplateVersionItem,
  type WorkspaceTemplate,
} from '@plp/contracts';

/*
 * Board 19 (ADR-030) as pure functions: what its columns, its version history and its save dialog
 * say about a workspace template.
 */

/** "AI ĐƯỢC DÙNG": "Toàn workspace", or the names of the member's sites it is limited to. */
export function scopeLabel(scope: WorkspaceTemplate['scope'], sites: readonly Site[]): string {
  if (scope.kind === 'workspace') {
    return 'Toàn workspace';
  }
  const names = scope.siteIds.flatMap((id) => {
    const site = sites.find((item) => item.id === id);
    return site === undefined ? [] : [site.name];
  });
  return names.length === 0 ? 'Không còn site nào' : names.join(', ');
}

/**
 * What a member can do about an archived template: restore it on board 19 with
 * `templates.manage`, otherwise ask those who can. Nothing is made from it until then.
 */
export function archivedHint(role: Access): string {
  return can(role, 'templates.manage')
    ? 'Khôi phục mẫu ở “Template của workspace” để dùng lại.'
    : `Chỉ ${holdersOf('templates.manage')} khôi phục được mẫu.`;
}

/** "ĐÃ TẠO": "3 trang", or "Chưa dùng". */
export function usedLabel(count: number): string {
  return count === 0 ? 'Chưa dùng' : `${count} trang`;
}

/** What one version of the history says it is: its note, or where its content came from. */
export function versionOrigin(version: TemplateVersionItem): string {
  if (version.note !== '') {
    return version.note;
  }
  return version.reusedFrom === null
    ? `Lưu từ trang “${version.source.pageTitle}”`
    : `Dùng lại nội dung v${version.reusedFrom}`;
}

/** "Đã tạo 2 trang". */
export function versionUsedLabel(count: number): string {
  return count === 0 ? 'Chưa tạo trang nào' : `Đã tạo ${count} trang`;
}

/** The templates of each tab of board 19: in use, or archived. */
export function templatesOfTab(
  templates: readonly WorkspaceTemplate[],
  archived: boolean,
): WorkspaceTemplate[] {
  return templates.filter((template) => template.archived === archived);
}

/** "3 trang đã tạo từ v1–v2 giữ nguyên, không tự cập nhật." of the save dialog. */
export function keptPagesNote(template: Pick<WorkspaceTemplate, 'usedCount' | 'currentVersion'>) {
  if (template.usedCount === 0) {
    return null;
  }
  const versions = template.currentVersion === 1 ? 'v1' : `v1–v${template.currentVersion}`;
  return `${template.usedCount} trang đã tạo từ ${versions} giữ nguyên, không tự cập nhật.`;
}

/** Who may use a template as the dialogs edit it. */
export type ScopeDraft = TemplateScope;

/** The scope a new template starts with: the site its page is in, or every site. */
export function initialScope(siteId: string | null): ScopeDraft {
  return siteId === null ? { kind: 'workspace' } : { kind: 'sites', siteIds: [siteId] };
}

/**
 * The scope with one site checked or not, in the order of the member's sites. The API never names
 * the others, and keeps them as they are (ADR-030).
 */
export function withScopeSite(
  scope: ScopeDraft,
  siteId: string,
  checked: boolean,
  sites: readonly Site[],
): ScopeDraft {
  const current = new Set(scope.kind === 'sites' ? scope.siteIds : []);
  if (checked) {
    current.add(siteId);
  } else {
    current.delete(siteId);
  }
  return {
    kind: 'sites',
    siteIds: sites.map((site) => site.id).filter((id) => current.has(id)),
  };
}
