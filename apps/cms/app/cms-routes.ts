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

/**
 * Builder routes are full-screen editing workspaces. Keep this detector
 * deliberately explicit so a future feature route containing "builder" does
 * not accidentally bypass the CMS management shell.
 */
export function isStandaloneWorkspaceRoute(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'workspaces' || !segments[1]) return false;

  const isPageBuilder =
    segments.length === 7 &&
    segments[2] === 'sites' &&
    Boolean(segments[3]) &&
    segments[4] === 'pages' &&
    Boolean(segments[5]) &&
    segments[6] === 'builder';
  const isWorkspaceLayoutBuilder =
    segments.length === 6 &&
    segments[2] === 'layouts' &&
    (segments[3] === 'headers' || segments[3] === 'footers') &&
    Boolean(segments[4]) &&
    segments[5] === 'builder';
  const isSiteLayoutBuilder =
    segments.length === 8 &&
    segments[2] === 'sites' &&
    Boolean(segments[3]) &&
    segments[4] === 'layouts' &&
    (segments[5] === 'headers' || segments[5] === 'footers') &&
    Boolean(segments[6]) &&
    segments[7] === 'builder';
  const isWorkspaceTemplateBuilder =
    segments.length === 5 &&
    segments[2] === 'templates' &&
    Boolean(segments[3]) &&
    segments[4] === 'builder';
  const isSiteTemplateBuilder =
    segments.length === 7 &&
    segments[2] === 'sites' &&
    Boolean(segments[3]) &&
    segments[4] === 'templates' &&
    Boolean(segments[5]) &&
    segments[6] === 'builder';

  return (
    isPageBuilder ||
    isWorkspaceLayoutBuilder ||
    isSiteLayoutBuilder ||
    isWorkspaceTemplateBuilder ||
    isSiteTemplateBuilder
  );
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
