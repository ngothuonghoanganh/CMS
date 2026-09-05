'use client';

import {
  AuthSessionResponseSchema,
  EffectivePermissionsResponseSchema,
  OrganizationListResponseSchema,
  WorkspaceListResponseSchema,
  type AuthSessionResponse,
  type Organization,
  type TenantPermission,
  type Workspace,
} from '@payload/contracts';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AppHeader } from './app-header';
import { cmsViewPath, type CmsView } from './cms-routes';
import { ApiClientError, api } from './lib/api';
import { Icon, type CmsIconName } from './ui/icons';

type CmsShellContextValue = {
  organizations: Organization[];
  session: AuthSessionResponse;
  workspaceId: string;
  permissions: TenantPermission[];
  workspaces: Workspace[];
  can: (permission: TenantPermission) => boolean;
};

const CmsShellContext = createContext<CmsShellContextValue | null>(null);

const viewLabels: Record<CmsView, string> = {
  analytics: 'Analytics',
  assets: 'Assets',
  audit: 'Audit log',
  billing: 'Billing & usage',
  collections: 'Collections',
  dashboard: 'Overview',
  domains: 'Domains',
  extensions: 'Extensions',
  integrations: 'Integrations',
  navigation: 'Navigation',
  organization: 'Organization',
  pages: 'Pages',
  roles: 'Roles',
  seo: 'SEO',
  sites: 'Sites',
  submissions: 'Submissions',
  templates: 'Templates',
  users: 'Users',
  workflows: 'Workflows',
  'design-system': 'Design system',
};

type NavigationItem = { key: CmsView; label: string; icon: CmsIconName };

function viewFromPathname(pathname: string): CmsView {
  const segments = pathname.split('/').filter(Boolean);
  const resource = segments[2];
  if (!resource) return 'dashboard';
  if (resource === 'sites') {
    const nestedResource = segments[4];
    if (nestedResource === 'pages') return 'pages';
    if (nestedResource === 'collections') return 'collections';
    if (nestedResource === 'navigation') return 'navigation';
    if (nestedResource === 'design-system') return 'design-system';
    if (nestedResource === 'seo') return 'seo';
    if (nestedResource === 'workflows') return 'workflows';
    return 'sites';
  }
  if (resource in viewLabels) return resource as CmsView;
  return 'dashboard';
}

function navigationSections(can: (permission: TenantPermission) => boolean) {
  const workspace: NavigationItem[] = [
    { icon: 'dashboard', key: 'dashboard', label: 'Dashboard' },
    ...(can('workspace.read')
      ? [{ icon: 'organization', key: 'organization', label: 'Organization' }]
      : []),
    ...(can('site.read') ? [{ icon: 'sites', key: 'sites', label: 'Sites' }] : []),
    ...(can('page.read') ? [{ icon: 'pages', key: 'pages', label: 'Pages' }] : []),
    ...(can('collection.read')
      ? [{ icon: 'collections', key: 'collections', label: 'Collections' }]
      : []),
    ...(can('site.read')
      ? [{ icon: 'navigation', key: 'navigation', label: 'Navigation' }]
      : []),
    ...(can('design-system.read')
      ? [{ icon: 'designSystem', key: 'design-system', label: 'Design system' }]
      : []),
    ...(can('asset.read') ? [{ icon: 'assets', key: 'assets', label: 'Assets' }] : []),
    ...(can('template.read')
      ? [{ icon: 'templates', key: 'templates', label: 'Templates' }]
      : []),
    ...(can('lead.read')
      ? [{ icon: 'submissions', key: 'submissions', label: 'Submissions' }]
      : []),
  ] as NavigationItem[];
  const operations: NavigationItem[] = [
    ...(can('workflow.read')
      ? [{ icon: 'workflows', key: 'workflows', label: 'Workflows' }]
      : []),
    ...(can('integration.read')
      ? [{ icon: 'integrations', key: 'integrations', label: 'Integrations' }]
      : []),
    ...(can('analytics.read')
      ? [{ icon: 'analytics', key: 'analytics', label: 'Analytics' }]
      : []),
    ...(can('domain.read')
      ? [{ icon: 'domains', key: 'domains', label: 'Domains' }]
      : []),
    ...(can('seo.read') ? [{ icon: 'seo', key: 'seo', label: 'SEO' }] : []),
  ] as NavigationItem[];
  const management: NavigationItem[] = [
    ...(can('billing.read')
      ? [{ icon: 'billing', key: 'billing', label: 'Billing & Usage' }]
      : []),
    ...(can('user.read') ? [{ icon: 'users', key: 'users', label: 'Users' }] : []),
    ...(can('role.read') ? [{ icon: 'roles', key: 'roles', label: 'Roles' }] : []),
    ...(can('audit.read') ? [{ icon: 'audit', key: 'audit', label: 'Audit Log' }] : []),
    ...(can('extensions.read') || can('layout.read')
      ? [{ icon: 'extensions', key: 'extensions', label: 'Extensions' }]
      : []),
  ] as NavigationItem[];
  return [
    { label: 'Workspace', items: workspace },
    { label: 'Operations', items: operations },
    { label: 'Management', items: management },
  ].filter((section) => section.items.length > 0);
}

function loadingShell() {
  return (
    <main className="loading-page" aria-busy="true">
      <div className="shell-loading" aria-label="Loading CMS">
        <div className="skeleton skeleton-mark" />
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-copy" />
        <div className="skeleton-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    </main>
  );
}

export function useCmsShell(): CmsShellContextValue {
  const context = useContext(CmsShellContext);
  if (!context) throw new Error('useCmsShell must be used inside CmsShell');
  return context;
}

export default function CmsShell({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const parentShell = useContext(CmsShellContext);
  const isNestedShell = parentShell?.workspaceId === workspaceId;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isBuilderRoute = pathname.includes('/builder');
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [permissions, setPermissions] = useState<TenantPermission[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(() => !isNestedShell);
  const [error, setError] = useState<string | null>(null);
  const mobileSidebarCloseRef = useRef<HTMLButtonElement>(null);
  const activeNavigationKey = viewFromPathname(pathname);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const can = useCallback(
    (permission: TenantPermission) => permissionSet.has(permission),
    [permissionSet],
  );
  const siteId = searchParams.get('siteId') ?? extractSiteId(pathname);

  useEffect(() => {
    if (isNestedShell) return;
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const currentSession = AuthSessionResponseSchema.parse(await api.get('/auth/me'));
        const permissionResponse = EffectivePermissionsResponseSchema.parse(
          await api.get(`/me/permissions?workspaceId=${encodeURIComponent(workspaceId)}`),
        );
        let nextOrganizations: Organization[] = [];
        let nextWorkspaces: Workspace[] = [];
        if (permissionResponse.permissions.includes('workspace.read')) {
          const [organizationResponse, workspaceResponse] = await Promise.all([
            api.get('/organizations'),
            api.get(
              `/organizations/${currentSession.workspace.organizationId}/workspaces`,
            ),
          ]);
          nextOrganizations =
            OrganizationListResponseSchema.parse(organizationResponse).items;
          nextWorkspaces = WorkspaceListResponseSchema.parse(workspaceResponse).items;
        }
        if (!active) return;
        setSession(currentSession);
        setPermissions(permissionResponse.permissions);
        setOrganizations(nextOrganizations);
        setWorkspaces(nextWorkspaces);
      } catch (caughtError) {
        if (!active) return;
        if (caughtError instanceof ApiClientError && caughtError.status === 401) {
          router.replace('/login');
        } else {
          setError(
            caughtError instanceof Error ? caughtError.message : 'Unable to load CMS.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isNestedShell, router, workspaceId]);

  useEffect(() => {
    if (isNestedShell) return;
    const stored = window.localStorage.getItem('cms.sidebar.collapsed');
    if (stored === 'true') setSidebarCollapsed(true);
  }, [isNestedShell]);

  useEffect(() => {
    if (isNestedShell) return;
    window.localStorage.setItem('cms.sidebar.collapsed', String(sidebarCollapsed));
  }, [isNestedShell, sidebarCollapsed]);

  useEffect(() => {
    if (isNestedShell || !mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileSidebarCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
      if (event.key !== 'Tab') return;
      const sidebar = document.getElementById('cms-sidebar');
      if (!sidebar) return;
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isNestedShell, mobileSidebarOpen]);

  useEffect(() => {
    if (isNestedShell) return;
    document.title = session
      ? `${viewLabels[activeNavigationKey]} · Payload CMS`
      : 'Payload CMS';
  }, [activeNavigationKey, isNestedShell, session]);

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } finally {
      router.replace('/login');
    }
  }

  async function switchContext(organizationId: string, nextWorkspaceId: string) {
    if (!organizationId || !nextWorkspaceId) return;
    try {
      await api.post('/auth/context', { organizationId, workspaceId: nextWorkspaceId });
      window.location.assign(`/workspaces/${encodeURIComponent(nextWorkspaceId)}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to switch workspace.',
      );
    }
  }

  if (isNestedShell) return <>{children}</>;
  if (loading) return loadingShell();
  if (!session) return <main className="loading-page">Redirecting to sign in…</main>;

  const currentOrganization = organizations.find(
    (organization) => organization.id === session.workspace.organizationId,
  );
  const currentCompanyName =
    currentOrganization?.name ?? session.user.tenantSlug ?? 'Current company';
  const context: CmsShellContextValue = {
    can,
    organizations,
    permissions,
    session,
    workspaceId,
    workspaces,
  };

  return (
    <CmsShellContext.Provider value={context}>
      <div className={sidebarCollapsed ? 'app-frame sidebar-is-collapsed' : 'app-frame'}>
        {mobileSidebarOpen ? (
          <button
            aria-label="Close navigation"
            className="sidebar-overlay"
            onClick={() => setMobileSidebarOpen(false)}
            type="button"
          />
        ) : null}
        <aside
          className={`${sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'}${
            mobileSidebarOpen ? ' mobile-open' : ''
          }`}
          id="cms-sidebar"
        >
          <div className="brand">
            <div className="brand-mark">PL</div>
            <div className="brand-copy">
              <strong>Payload CMS</strong>
              <span>Page platform</span>
            </div>
            <button
              ref={mobileSidebarCloseRef}
              aria-label="Close navigation"
              className="sidebar-close"
              onClick={() => setMobileSidebarOpen(false)}
              type="button"
            >
              ×
            </button>
            <button
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((current) => !current)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              type="button"
            >
              {sidebarCollapsed ? '→' : '←'}
            </button>
          </div>
          <nav aria-label="Primary navigation" className="nav-list">
            {navigationSections(can).map((section) => (
              <div className="nav-section" key={section.label}>
                <span className="nav-section-label">{section.label}</span>
                {section.items.map((item) => {
                  const href = navigationHref(workspaceId, item.key, siteId);
                  const active = activeNavigationKey === item.key;
                  return (
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={active ? 'nav-item active' : 'nav-item'}
                      href={href}
                      key={item.key}
                      onClick={() => setMobileSidebarOpen(false)}
                      role="button"
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <span className="nav-icon">
                        <Icon name={item.icon} />
                      </span>
                      <span className="nav-label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <main
          className={
            isBuilderRoute ? 'content-area content-area-builder' : 'content-area'
          }
        >
          <AppHeader
            companyName={currentCompanyName}
            currentWorkspaceId={session.workspace.id}
            mobileSidebarOpen={mobileSidebarOpen}
            onLogout={() => void handleLogout()}
            onOpenSidebar={() => setMobileSidebarOpen((current) => !current)}
            onSwitchWorkspace={(nextWorkspaceId) =>
              void switchContext(session.workspace.organizationId, nextWorkspaceId)
            }
            userEmail={session.user.email}
            workspaces={workspaces}
          />
          <section
            className={
              isBuilderRoute ? 'content-inner content-inner-builder' : 'content-inner'
            }
          >
            {error ? (
              <div className="alert alert-error" role="alert">
                <div>
                  <strong>We couldn’t load this CMS shell.</strong>
                  <span className="muted">{error}</span>
                </div>
                <button
                  className="button button-small button-ghost"
                  onClick={() => window.location.reload()}
                  type="button"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {children}
          </section>
        </main>
      </div>
    </CmsShellContext.Provider>
  );
}

function extractSiteId(pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean);
  return segments[2] === 'sites' && segments[3] ? segments[3] : undefined;
}

function navigationHref(workspaceId: string, view: CmsView, siteId?: string): string {
  const path = cmsViewPath(workspaceId, view, siteId);
  return view === 'domains' || view === 'extensions' || view === 'templates'
    ? siteId
      ? `${path}?siteId=${encodeURIComponent(siteId)}`
      : path
    : path;
}
