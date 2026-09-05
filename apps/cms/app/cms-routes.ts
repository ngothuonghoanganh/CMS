export type CmsView =
  | 'dashboard'
  | 'sites'
  | 'pages'
  | 'navigation'
  | 'design-system'
  | 'assets'
  | 'templates'
  | 'collections'
  | 'submissions'
  | 'integrations'
  | 'analytics'
  | 'domains'
  | 'seo'
  | 'billing'
  | 'roles'
  | 'audit'
  | 'users'
  | 'extensions'
  | 'workflows'
  | 'organization';

export type CmsRoute = {
  view: CmsView;
  workspaceId?: string;
  siteId?: string;
  pageId?: string;
  collectionId?: string;
  assetAction?: 'create';
  collectionAction?: 'create' | 'schema';
  siteAction?: 'create' | 'edit';
  pageAction?: 'create' | 'edit';
  templateAction?: 'create' | 'edit';
  templateId?: string;
  templateVersionId?: string;
  previewEntryId?: string;
  entryId?: string;
  entryAction?: 'create' | 'edit';
};

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function workspacePath(workspaceId: string): string {
  return `/workspaces/${segment(workspaceId)}`;
}

export function sitePath(workspaceId: string, siteId: string): string {
  return `${workspacePath(workspaceId)}/sites/${segment(siteId)}`;
}

export function pagesPath(workspaceId: string, siteId?: string): string {
  return siteId
    ? `${sitePath(workspaceId, siteId)}/pages`
    : `${workspacePath(workspaceId)}/pages`;
}

export function pagePath(
  workspaceId: string,
  siteId: string,
  pageId: string,
  action?: 'edit' | 'builder' | 'seo' | 'workflows',
): string {
  const base = `${pagesPath(workspaceId, siteId)}/${segment(pageId)}`;
  return action ? `${base}/${action}` : base;
}

export function collectionPath(
  workspaceId: string,
  siteId: string,
  collectionId?: string,
  child?: 'entries' | 'schema' | 'settings',
): string {
  const base = `${sitePath(workspaceId, siteId)}/collections`;
  if (!collectionId) return base;
  return `${base}/${segment(collectionId)}${child ? `/${child}` : ''}`;
}

export function templatePath(
  workspaceId: string,
  templateId: string,
  action?: 'edit',
): string {
  const base = `${workspacePath(workspaceId)}/templates/${segment(templateId)}`;
  return action ? `${base}/${action}` : base;
}

export function cmsViewPath(workspaceId: string, view: CmsView, siteId?: string): string {
  switch (view) {
    case 'dashboard':
      return workspacePath(workspaceId);
    case 'sites':
      return `${workspacePath(workspaceId)}/sites`;
    case 'pages':
      return pagesPath(workspaceId, siteId);
    case 'navigation':
      return siteId
        ? `${sitePath(workspaceId, siteId)}/navigation`
        : `${workspacePath(workspaceId)}/navigation`;
    case 'design-system':
      return siteId
        ? `${sitePath(workspaceId, siteId)}/design-system`
        : `${workspacePath(workspaceId)}/design-system`;
    case 'collections':
      return siteId
        ? collectionPath(workspaceId, siteId)
        : `${workspacePath(workspaceId)}/collections`;
    case 'seo':
      return siteId
        ? `${sitePath(workspaceId, siteId)}/seo`
        : `${workspacePath(workspaceId)}/seo`;
    case 'workflows':
      return siteId
        ? `${sitePath(workspaceId, siteId)}/workflows`
        : `${workspacePath(workspaceId)}/workflows`;
    case 'organization':
    case 'assets':
    case 'templates':
    case 'submissions':
    case 'integrations':
    case 'analytics':
    case 'domains':
    case 'billing':
    case 'roles':
    case 'audit':
    case 'users':
    case 'extensions':
      return `${workspacePath(workspaceId)}/${view}`;
  }
}
