'use client';

import {
  AssetListResponseSchema,
  AuditLogListResponseSchema,
  AuthSessionResponseSchema,
  EffectivePermissionsResponseSchema,
  OrganizationListResponseSchema,
  OrganizationMembershipListResponseSchema,
  WorkspaceListResponseSchema,
  CustomDomainListResponseSchema,
  FormIntegrationBindingListResponseSchema,
  IntegrationListResponseSchema,
  NavigationListResponseSchema,
  NavigationSchema,
  SubmissionListResponseSchema,
  PageListResponseSchema,
  PageSeoSettingsSchema,
  PageVersionListResponseSchema,
  SiteListResponseSchema,
  SitePublishResponseSchema,
  TemplateListResponseSchema,
  TemplateVersionsResponseSchema,
  RoleListResponseSchema,
  TenantUserDetailResponseSchema,
  TenantUserListResponseSchema,
  type Asset,
  type AuthSessionResponse,
  type AuditLog,
  type Organization,
  type OrganizationMembership,
  type Workspace,
  type CustomDomain,
  type FormSubmission,
  type FormIntegrationBinding,
  type Integration,
  type Navigation,
  type NavigationItem,
  type Page,
  type PageVersion,
  type PageSeoSettings,
  type Role,
  type TenantUserDetailResponse,
  type TenantUserListItem,
  type TenantUserListQuery,
  type TenantUserStatus,
  type Site,
  type Template,
  type TemplateVersion,
  type TenantPermission,
  normalizeUrlSlug,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { ApiClientError, api } from './lib/api';
import { IntegrationsView } from './integrations-view';
import { AnalyticsView } from './analytics-view';
import { DomainsView } from './domains-view';
import { SeoView } from './seo-view';
import { BillingView } from './billing-view';
import { RolesView } from './roles-view';
import { AuditView } from './audit-view';
import { UsersView } from './users-view';
import { StatusBadge } from './status-badge';
import { AppHeader } from './app-header';
import { ExtensionsView } from './extensions-view';
import { WorkflowsView } from './workflows-view';
import { NavigationView } from './navigation-view';
import { DesignSystemView } from './design-system-view';
import { PagesView as SiteMapPagesView } from './pages/pages-view';
import { Drawer, PageHeader, PaginationControls, ResourceToolbar } from './ui/surfaces';
import { CollectionsView } from './collections-view';

type View =
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
type SiteForm = { name: string; slug: string };
type PageForm = { name: string; description: string; path: string };
type AssetForm = { filename: string; mimeType: string; size: string; storageKey: string };
type TemplateForm = { name: string; description: string };
type DomainForm = {
  hostname: string;
  siteId: string;
  landingPageId: string;
  isPrimary: boolean;
};

const blankSite: SiteForm = { name: '', slug: '' };
const blankPage: PageForm = { name: '', description: '', path: '' };
const blankAsset: AssetForm = {
  filename: '',
  mimeType: 'image/png',
  size: '0',
  storageKey: '/assets/',
};
const blankTemplate: TemplateForm = { name: '', description: '' };
const blankDomain: DomainForm = {
  hostname: '',
  siteId: '',
  landingPageId: '',
  isPrimary: false,
};
const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

const viewLabels: Record<View, string> = {
  analytics: 'Analytics',
  assets: 'Assets',
  audit: 'Audit log',
  billing: 'Billing & usage',
  dashboard: 'Overview',
  domains: 'Domains',
  integrations: 'Integrations',
  organization: 'Organization',
  pages: 'Pages',
  navigation: 'Navigation',
  'design-system': 'Design system',
  roles: 'Roles',
  seo: 'SEO',
  sites: 'Sites',
  submissions: 'Submissions',
  templates: 'Templates',
  collections: 'Collections',
  users: 'Users',
  extensions: 'Extensions',
  workflows: 'Workflows',
};

function defaultPayload(title: string) {
  return {
    metadata: { documentTitle: title },
    root: { children: [], id: 'root', props: {}, type: 'root' as const },
    version: 1 as const,
  };
}

export default function CmsDashboard() {
  const router = useRouter();
  const [view, setView] = useState<View>('dashboard');
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [permissions, setPermissions] = useState<TenantPermission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<TenantUserListItem[]>([]);
  const [userPagination, setUserPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [userSearch, setUserSearch] = useState('');
  const [userStatus, setUserStatusFilter] = useState<TenantUserStatus | undefined>();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPagination, setAuditPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditResourceFilter, setAuditResourceFilter] = useState('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [managementOrganizationId, setManagementOrganizationId] = useState('');
  const [organizationMembers, setOrganizationMembers] = useState<
    OrganizationMembership[]
  >([]);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
  const [sites, setSites] = useState<Site[]>([]);
  const [sitePagination, setSitePagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [sitePaging, setSitePaging] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [navigations, setNavigations] = useState<Navigation[]>([]);
  const [seoSettings, setSeoSettings] = useState<PageSeoSettings | null>(null);
  const [formBindings, setFormBindings] = useState<FormIntegrationBinding[]>([]);
  const [bindingSaving, setBindingSaving] = useState(false);
  const [submissionPage, setSubmissionPage] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [submissionSearch, setSubmissionSearch] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(
    null,
  );
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [siteForm, setSiteForm] = useState<SiteForm>(blankSite);
  const [pageForm, setPageForm] = useState<PageForm>(blankPage);
  const [pageTemplateId, setPageTemplateId] = useState<string | null>(null);
  const [pageTemplateVersionId, setPageTemplateVersionId] = useState<string | null>(null);
  const [assetForm, setAssetForm] = useState<AssetForm>(blankAsset);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(blankTemplate);
  const [domainForm, setDomainForm] = useState<DomainForm>(blankDomain);
  const [editingSiteId, setEditingSiteId] = useState('');
  const [siteDrawerOpen, setSiteDrawerOpen] = useState(false);
  const [pageDrawerOpen, setPageDrawerOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pagesRequestId = useRef(0);
  const sitesRequestId = useRef(0);
  const pageDetailsRequestId = useRef(0);
  const submissionsRequestId = useRef(0);
  const mobileSidebarCloseRef = useRef<HTMLButtonElement>(null);
  const autoOpenedSiteDrawerRef = useRef(false);
  const autoOpenedPageDrawerSiteRef = useRef('');
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const can = (permission: TenantPermission) => permissionSet.has(permission);

  const selectedPage = pages.find((page) => page.id === selectedPageId);
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const counts = useMemo(
    () => ({
      assets: assets.length,
      pages: pages.length,
      sites: sitePagination.total,
      templates: templates.length,
    }),
    [assets.length, pages.length, sitePagination.total, templates.length],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (loading) return;
    const searchParams = new URLSearchParams(window.location.search);
    const requestedView = searchParams.get('view');
    if (requestedView === 'layouts') {
      // Keep old deep links useful while the layout editor now lives in Extensions.
      setView('extensions');
    } else if (requestedView && requestedView in viewLabels) {
      setView(requestedView as View);
    }
    const requestedSiteId = searchParams.get('siteId');
    if (requestedSiteId && sites.some((site) => site.id === requestedSiteId)) {
      setSelectedSiteId(requestedSiteId);
    }
    const requestedPageId = searchParams.get('pageId');
    if (requestedPageId && pages.some((page) => page.id === requestedPageId)) {
      setSelectedPageId(requestedPageId);
    }
  }, [loading, pages, sites]);

  useEffect(() => {
    const stored = window.localStorage.getItem('cms.sidebar.collapsed');
    if (stored === 'true') setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('cms.sidebar.collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
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
  }, [mobileSidebarOpen]);

  useEffect(() => {
    document.title = session ? `${viewLabels[view]} · Payload CMS` : 'Payload CMS';
  }, [session, view]);

  useEffect(() => {
    if (view !== 'organization' || !managementOrganizationId) return;
    void refreshOrganizationManagement(managementOrganizationId);
  }, [managementOrganizationId, view]);

  useEffect(() => {
    if (selectedSiteId) {
      void refreshPages(selectedSiteId);
    } else {
      pagesRequestId.current += 1;
      setPages([]);
      setSelectedPageId('');
    }
  }, [selectedSiteId]);

  useEffect(() => {
    if (view !== 'sites') {
      autoOpenedSiteDrawerRef.current = false;
      return;
    }
    if (!autoOpenedSiteDrawerRef.current) {
      autoOpenedSiteDrawerRef.current = true;
      setEditingSiteId('');
      setSiteForm(blankSite);
      setSiteDrawerOpen(true);
    }
  }, [view]);

  useEffect(() => {
    if (
      view === 'pages' &&
      selectedSiteId &&
      autoOpenedPageDrawerSiteRef.current === selectedSiteId
    ) {
      autoOpenedPageDrawerSiteRef.current = '';
      setSelectedPageId('');
      setPageForm(blankPage);
      setPageDrawerOpen(true);
    }
  }, [selectedSiteId, view]);

  useEffect(() => {
    if ((view === 'domains' || view === 'seo') && selectedSiteId) {
      void refreshPages(selectedSiteId);
    }
  }, [view]);

  useEffect(() => {
    if (view === 'navigation' && selectedSiteId) {
      void refreshNavigations(selectedSiteId);
    }
  }, [selectedSiteId, view]);

  useEffect(() => {
    const requestId = ++pageDetailsRequestId.current;
    if (selectedPageId) {
      void refreshVersions(selectedPageId, requestId);
      void refreshFormBindings(selectedPageId, requestId);
      void refreshSeo(selectedPageId, requestId);
    } else {
      setVersions([]);
      setFormBindings([]);
      setSeoSettings(null);
    }
  }, [selectedPageId]);

  useEffect(() => {
    const requestId = ++submissionsRequestId.current;
    if (view === 'submissions' && session) {
      void refreshSubmissions(0, requestId);
    }
  }, [session, submissionSearch, submissionStatus, view]);

  async function bootstrap() {
    setLoading(true);
    try {
      const currentSession = AuthSessionResponseSchema.parse(await api.get('/auth/me'));
      setSession(currentSession);
      const permissionResponse = EffectivePermissionsResponseSchema.parse(
        await api.get(`/me/permissions?workspaceId=${currentSession.workspace.id}`),
      );
      setPermissions(permissionResponse.permissions);
      const hasPermission = (permission: TenantPermission) =>
        permissionResponse.permissions.includes(permission);
      if (hasPermission('workspace.read')) {
        setManagementOrganizationId(currentSession.workspace.organizationId);
        const organizationResponse = OrganizationListResponseSchema.parse(
          await api.get('/organizations'),
        );
        setOrganizations(organizationResponse.items);
        const workspaceResponse = WorkspaceListResponseSchema.parse(
          await api.get(
            `/organizations/${currentSession.workspace.organizationId}/workspaces`,
          ),
        );
        setWorkspaces(workspaceResponse.items);
      } else {
        setManagementOrganizationId('');
        setOrganizations([]);
        setWorkspaces([]);
      }
      const workspaceId = currentSession.workspace.id;
      const siteResponse = hasPermission('site.read')
        ? await api.get(`/workspaces/${workspaceId}/sites?limit=20&offset=0`)
        : null;
      const assetResponse = hasPermission('asset.read')
        ? await api.get(`/workspaces/${workspaceId}/assets?limit=100`)
        : null;
      const templateResponse = hasPermission('template.read')
        ? await api.get(`/workspaces/${workspaceId}/templates?limit=100`)
        : null;
      const domainResponse = hasPermission('domain.read')
        ? await api.get(`/workspaces/${workspaceId}/domains`)
        : null;
      const parsedSites = siteResponse
        ? SiteListResponseSchema.parse(siteResponse)
        : null;
      const nextSites = parsedSites?.items ?? [];
      setSites(nextSites);
      setSitePagination(
        parsedSites?.pagination ?? { limit: 20, offset: 0, total: 0, hasNextPage: false },
      );
      setAssets(assetResponse ? AssetListResponseSchema.parse(assetResponse).items : []);
      setTemplates(
        templateResponse ? TemplateListResponseSchema.parse(templateResponse).items : [],
      );
      setDomains(
        domainResponse ? CustomDomainListResponseSchema.parse(domainResponse).items : [],
      );
      if (hasPermission('integration.read')) {
        const integrationResponse = await api.get(
          `/workspaces/${workspaceId}/integrations?limit=100`,
        );
        setIntegrations(IntegrationListResponseSchema.parse(integrationResponse).items);
      } else {
        setIntegrations([]);
      }
      setSelectedSiteId((current) => current || nextSites[0]?.id || '');
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.status === 401) {
        router.replace('/login');
        return;
      }
      setError(toErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  async function refreshSites(offset = 0) {
    if (!session) return;
    const requestId = ++sitesRequestId.current;
    setSitePaging(true);
    try {
      const response = SiteListResponseSchema.parse(
        await api.get(
          `/workspaces/${session.workspace.id}/sites?limit=20&offset=${offset}`,
        ),
      );
      if (requestId !== sitesRequestId.current) return;
      setSites(response.items);
      setSitePagination(response.pagination);
    } catch (caughtError) {
      if (requestId !== sitesRequestId.current) return;
      setError(toErrorMessage(caughtError));
    } finally {
      if (requestId === sitesRequestId.current) setSitePaging(false);
    }
  }

  async function refreshRoles() {
    try {
      const response = await api.get('/roles');
      setRoles(RoleListResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshUsers(
    input: Pick<TenantUserListQuery, 'search' | 'status'> = {},
    offset = 0,
  ) {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (input.search) params.set('search', input.search);
      if (input.status) params.set('status', input.status);
      const response = TenantUserListResponseSchema.parse(
        await api.get(`/users?${params.toString()}`),
      );
      setUsers(response.items);
      setUserPagination(response.pagination);
      setUserSearch(input.search ?? '');
      setUserStatusFilter(input.status);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function loadUserDetail(
    userId: string,
  ): Promise<TenantUserDetailResponse | null> {
    try {
      return TenantUserDetailResponseSchema.parse(await api.get(`/users/${userId}`));
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
      return null;
    }
  }

  async function refreshAudit(
    offset = 0,
    filters: { action?: string | undefined; resourceType?: string | undefined } = {},
  ) {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (filters.action) params.set('action', filters.action);
      if (filters.resourceType) params.set('resourceType', filters.resourceType);
      const response = AuditLogListResponseSchema.parse(
        await api.get(`/audit-logs?${params.toString()}`),
      );
      setAuditLogs(response.items);
      setAuditPagination(response.pagination);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  useEffect(() => {
    if (view === 'roles' && can('role.read')) void refreshRoles();
    if (view === 'users' && can('user.read')) {
      void refreshUsers({ search: userSearch || undefined, status: userStatus });
      if (can('role.read')) void refreshRoles();
    }
    if (view === 'audit' && can('audit.read')) {
      void refreshAudit(0, {
        action: auditActionFilter || undefined,
        resourceType: auditResourceFilter || undefined,
      });
    }
  }, [auditActionFilter, auditResourceFilter, view, permissions]);

  async function createUser(input: {
    email: string;
    displayName?: string;
    password: string;
    roleId?: string;
    scope?: 'tenant' | 'workspace';
    workspaceId?: string;
  }) {
    await runBusy(async () => {
      await api.post('/users', input);
      await refreshUsers({ search: userSearch || undefined, status: userStatus });
      setNotice('User created.');
    });
  }

  async function updateUser(userId: string, input: { displayName?: string | null }) {
    await runBusy(async () => {
      await api.patch(`/users/${userId}`, input);
      await refreshUsers({ search: userSearch || undefined, status: userStatus });
      setNotice('User profile updated.');
    });
  }

  async function changeUserStatus(userId: string, status: TenantUserStatus) {
    await runBusy(async () => {
      await api.post(`/users/${userId}/${status === 'active' ? 'enable' : 'disable'}`);
      await refreshUsers({ search: userSearch || undefined, status: userStatus });
      setNotice(status === 'active' ? 'User enabled.' : 'User disabled.');
    });
  }

  async function removeUser(userId: string) {
    await runBusy(async () => {
      await api.delete(`/users/${userId}`);
      await refreshUsers({ search: userSearch || undefined, status: userStatus });
      setNotice('User removed and retained as a disabled audit record.');
    });
  }

  async function assignUserRole(
    userId: string,
    input: { roleId: string; scope: 'tenant' | 'workspace'; workspaceId?: string },
  ) {
    await runBusy(async () => {
      await api.post(`/users/${userId}/role-assignments`, input);
      setNotice('Role assigned.');
    });
  }

  async function unassignUserRole(userId: string, assignmentId: string) {
    await runBusy(async () => {
      await api.delete(`/users/${userId}/role-assignments/${assignmentId}`);
      setNotice('Role unassigned.');
    });
  }

  async function createRole(input: {
    key: string;
    name: string;
    description?: string;
    permissions: TenantPermission[];
  }) {
    await runBusy(async () => {
      const created = await api.post<Role>('/roles', input);
      setRoles((current) => [...current, created]);
      setNotice('Role created.');
    });
  }

  async function updateRole(
    roleId: string,
    input: {
      name?: string;
      description?: string | null;
      permissions?: TenantPermission[];
    },
  ) {
    await runBusy(async () => {
      const updated = await api.patch<Role>(`/roles/${roleId}`, input);
      setRoles((current) =>
        current.map((role) => (role.id === updated.id ? updated : role)),
      );
      setNotice('Role updated.');
    });
  }

  async function assignRole(input: {
    userId: string;
    roleId: string;
    scope: 'tenant' | 'workspace';
    workspaceId?: string;
  }) {
    await runBusy(async () => {
      await api.post('/role-assignments', input);
      setNotice('Role assigned.');
      await refreshRoles();
    });
  }

  async function refreshOrganizationManagement(organizationId: string) {
    try {
      const workspaceResponse = await api.get(
        `/organizations/${organizationId}/workspaces`,
      );
      setWorkspaces(WorkspaceListResponseSchema.parse(workspaceResponse).items);
      if (can('member.read')) {
        const memberResponse = await api.get(`/organizations/${organizationId}/members`);
        setOrganizationMembers(
          OrganizationMembershipListResponseSchema.parse(memberResponse).items,
        );
      } else {
        setOrganizationMembers([]);
      }
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runBusy(async () => {
      const created = await api.post<Organization>('/organizations', {
        name: organizationName,
        ...(organizationSlug ? { slug: organizationSlug } : {}),
      });
      setOrganizations((current) => [...current, created]);
      setManagementOrganizationId(created.id);
      setOrganizationName('');
      setOrganizationSlug('');
      setNotice('Organization created. Create a workspace to start using it.');
    });
  }

  async function createWorkspaceForOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managementOrganizationId) return;
    await runBusy(async () => {
      const created = await api.post<Workspace>(
        `/organizations/${managementOrganizationId}/workspaces`,
        { name: newWorkspaceName },
      );
      setWorkspaces((current) => [...current, created]);
      setNewWorkspaceName('');
      setNotice('Workspace created.');
    });
  }

  async function addOrganizationMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managementOrganizationId) return;
    await runBusy(async () => {
      const created = await api.post<OrganizationMembership>(
        `/organizations/${managementOrganizationId}/members`,
        { userId: newMemberUserId, role: newMemberRole },
      );
      setOrganizationMembers((current) => [...current, created]);
      setNewMemberUserId('');
      setNotice('Member added.');
    });
  }

  async function updateOrganizationMember(
    member: OrganizationMembership,
    role: OrganizationMembership['role'],
  ) {
    await runBusy(async () => {
      const updated = await api.patch<OrganizationMembership>(
        `/organizations/${managementOrganizationId}/members/${member.id}`,
        { role },
      );
      setOrganizationMembers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Member role updated.');
    });
  }

  async function removeOrganizationMember(member: OrganizationMembership) {
    await runBusy(async () => {
      await api.delete(`/organizations/${managementOrganizationId}/members/${member.id}`);
      setOrganizationMembers((current) =>
        current.filter((item) => item.id !== member.id),
      );
      setNotice('Member removed.');
    });
  }

  async function switchContext(organizationId: string, workspaceId: string) {
    if (!organizationId || !workspaceId) return;
    setError(null);
    try {
      await api.post('/auth/context', { organizationId, workspaceId });
      // Clear every tenant-sensitive view before the new server context is read.
      setSites([]);
      setSitePagination({ limit: 20, offset: 0, total: 0, hasNextPage: false });
      setPages([]);
      setAssets([]);
      setTemplates([]);
      setSubmissions([]);
      setIntegrations([]);
      setDomains([]);
      setNavigations([]);
      setSelectedSiteId('');
      setSelectedPageId('');
      window.location.reload();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshPages(siteId: string) {
    const requestId = ++pagesRequestId.current;
    try {
      const response = await api.get(`/sites/${siteId}/pages?limit=100`);
      const nextPages = PageListResponseSchema.parse(response).items;
      if (requestId !== pagesRequestId.current) return;
      setPages(nextPages);
      setSelectedPageId((current) =>
        nextPages.some((page) => page.id === current) ? current : '',
      );
    } catch (caughtError) {
      if (requestId !== pagesRequestId.current) return;
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshNavigations(siteId: string) {
    try {
      const response = await api.get(`/sites/${siteId}/navigations`);
      setNavigations(NavigationListResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshVersions(
    pageId: string,
    requestId = pageDetailsRequestId.current,
  ) {
    try {
      const response = await api.get(`/pages/${pageId}/versions?limit=100`);
      if (requestId !== pageDetailsRequestId.current) return;
      setVersions(PageVersionListResponseSchema.parse(response).items);
    } catch (caughtError) {
      if (requestId !== pageDetailsRequestId.current) return;
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshSubmissions(
    offset: number,
    requestId = ++submissionsRequestId.current,
  ) {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (submissionSearch.trim()) params.set('search', submissionSearch.trim());
      if (submissionStatus) params.set('status', submissionStatus);
      const response = await api.get(`/submissions?${params.toString()}`);
      const parsed = SubmissionListResponseSchema.parse(response);
      if (requestId !== submissionsRequestId.current) return;
      setSubmissions(parsed.items);
      setSubmissionPage(parsed.pagination);
      setSelectedSubmission((current) =>
        current && parsed.items.some((item) => item.id === current.id) ? current : null,
      );
    } catch (caughtError) {
      if (requestId !== submissionsRequestId.current) return;
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshFormBindings(
    pageId: string,
    requestId = pageDetailsRequestId.current,
  ) {
    try {
      const response = await api.get(`/pages/${pageId}/form-integrations`);
      if (requestId !== pageDetailsRequestId.current) return;
      setFormBindings(FormIntegrationBindingListResponseSchema.parse(response).items);
    } catch (caughtError) {
      if (requestId !== pageDetailsRequestId.current) return;
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshSeo(pageId: string, requestId = pageDetailsRequestId.current) {
    try {
      const response = await api.get(`/pages/${pageId}/seo`);
      if (requestId !== pageDetailsRequestId.current) return;
      setSeoSettings(PageSeoSettingsSchema.parse(response));
    } catch (caughtError) {
      if (requestId !== pageDetailsRequestId.current) return;
      setError(toErrorMessage(caughtError));
    }
  }

  async function saveFormBinding(formNodeId: string, integrationIds: string[]) {
    if (!selectedPageId) return;
    setBindingSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.patch(
        `/pages/${selectedPageId}/form-integrations/${formNodeId}`,
        { integrationIds },
      );
      const saved =
        FormIntegrationBindingListResponseSchema.shape.items.element.parse(response);
      setFormBindings((current) => [
        ...current.filter((item) => item.formNodeId !== saved.formNodeId),
        saved,
      ]);
      setNotice('Form notifications updated.');
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setBindingSaving(false);
    }
  }

  async function updateSubmissionStatus(
    submission: FormSubmission,
    status: FormSubmission['status'],
  ) {
    await runBusy(async () => {
      const updated = await api.patch<FormSubmission>(`/submissions/${submission.id}`, {
        status,
      });
      setSubmissions((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedSubmission(updated);
      setNotice('Submission status updated.');
    });
  }

  async function publishPage(page: Page) {
    await runBusy(async () => {
      const updated = await api.post<Page>(`/pages/${page.id}/publish`, {});
      setPages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Page published.');
      if (page.id === selectedPageId) {
        void refreshVersions(page.id);
      }
    });
  }

  async function publishSite(site: Site) {
    if (!session) return;
    await runBusy(async () => {
      const updated = SitePublishResponseSchema.parse(
        await api.post(
          `/workspaces/${session.workspace.id}/sites/${site.id}/publish`,
          {},
        ),
      );
      setSites((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Site published.');
    });
  }

  async function unpublishPage(page: Page) {
    await runBusy(async () => {
      const updated = await api.post<Page>(`/pages/${page.id}/unpublish`);
      setPages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Page unpublished.');
      if (page.id === selectedPageId) {
        void refreshVersions(page.id);
      }
    });
  }

  async function duplicatePage(page: Page) {
    await runBusy(async () => {
      const duplicated = await api.post<Page>(`/pages/${page.id}/duplicate`, {});
      setPages((current) => [duplicated, ...current]);
      setSelectedPageId(duplicated.id);
      setPageForm({
        name: duplicated.name,
        description: duplicated.description ?? '',
        path: duplicated.path,
      });
      setPageDrawerOpen(true);
      setPageTemplateId(null);
      setPageTemplateVersionId(null);
      setNotice('Page duplicated as a draft.');
    });
  }

  async function setHomepage(page: Page) {
    await runBusy(async () => {
      const updated = await api.post<Page>(`/pages/${page.id}/homepage`);
      setPages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(`${page.name} is now the homepage.`);
      await refreshPages(page.siteId);
    });
  }

  async function removePage(page: Page) {
    await runBusy(async () => {
      await api.delete(`/pages/${page.id}`);
      setPages((current) => current.filter((item) => item.id !== page.id));
      if (selectedPageId === page.id) {
        setSelectedPageId('');
        setPageForm(blankPage);
      }
      setPageDrawerOpen(false);
      setNotice('Page deleted.');
    });
  }

  function previewPage(page: Page) {
    window.open(
      `${rendererBaseUrl}/preview/${encodeURIComponent(page.id)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } finally {
      router.replace('/login');
    }
  }

  async function handleSiteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await runBusy(async () => {
      const workspaceId = session.workspace.id;
      if (editingSiteId) {
        const updated = await api.patch<Site>(
          `/workspaces/${workspaceId}/sites/${editingSiteId}`,
          siteForm,
        );
        setSites((current) =>
          current.map((site) => (site.id === updated.id ? updated : site)),
        );
        setNotice('Site metadata updated.');
      } else {
        const created = await api.post<Site>(`/workspaces/${workspaceId}/sites`, {
          name: siteForm.name,
          slug: siteForm.slug || normalizeUrlSlug(siteForm.name),
        });
        await refreshSites(0);
        setSelectedSiteId(created.id);
        autoOpenedPageDrawerSiteRef.current = created.id;
        setNotice('Site created.');
      }
      setEditingSiteId('');
      setSiteForm(blankSite);
      setSiteDrawerOpen(false);
    });
  }

  async function handlePageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedSiteId) return;
    await runBusy(async () => {
      if (selectedPageId) {
        const normalizedPath = normalizeUrlSlug(pageForm.path.replace(/^\/+/, ''));
        const updated = await api.patch<Page>(`/pages/${selectedPageId}`, {
          expectedVersionNumber: versions[0]?.versionNumber,
          name: pageForm.name,
          description: pageForm.description.trim() || null,
          ...(normalizedPath ? { path: `/${normalizedPath}` } : {}),
        });
        setPages((current) =>
          current.map((page) => (page.id === updated.id ? updated : page)),
        );
        setNotice('Page metadata updated.');
      } else {
        const normalizedPath = normalizeUrlSlug(pageForm.path.replace(/^\/+/, ''));
        const created = pageTemplateId
          ? await api.post<Page>(
              `/workspaces/${session.workspace.id}/templates/${pageTemplateId}/apply`,
              {
                siteId: selectedSiteId,
                name: pageForm.name,
                ...(pageTemplateVersionId
                  ? { templateVersionId: pageTemplateVersionId }
                  : {}),
                ...(pageForm.description.trim()
                  ? { description: pageForm.description.trim() }
                  : {}),
                ...(normalizedPath ? { path: `/${normalizedPath}` } : {}),
              },
            )
          : await api.post<Page>(`/sites/${selectedSiteId}/pages`, {
              name: pageForm.name,
              ...(pageForm.description.trim()
                ? { description: pageForm.description.trim() }
                : {}),
              ...(normalizedPath ? { path: `/${normalizedPath}` } : {}),
              payload: defaultPayload(pageForm.name),
            });
        pagesRequestId.current += 1;
        setPages((current) => [created, ...current]);
        setSelectedPageId(created.id);
        setNotice(
          pageTemplateId
            ? 'Page created from an independent template snapshot.'
            : 'Page and draft version 1 created.',
        );
      }
      setPageForm(blankPage);
      setPageTemplateId(null);
      setPageTemplateVersionId(null);
      setPageDrawerOpen(false);
    });
  }

  async function handleAssetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await runBusy(async () => {
      const created = await api.post<Asset>(
        `/workspaces/${session.workspace.id}/assets`,
        {
          ...assetForm,
          size: Number(assetForm.size),
        },
      );
      setAssets((current) => [created, ...current]);
      setAssetForm(blankAsset);
      setNotice('Asset metadata created. Binary upload is outside this phase.');
    });
  }

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await runBusy(async () => {
      const basePath = `/workspaces/${session.workspace.id}/templates`;
      if (editingTemplateId) {
        const updated = await api.patch<Template>(
          `${basePath}/${editingTemplateId}`,
          templateForm,
        );
        setTemplates((current) =>
          current.map((template) => (template.id === updated.id ? updated : template)),
        );
        setNotice('Template metadata updated.');
      } else {
        const created = await api.post<Template>(basePath, {
          ...templateForm,
          ...(selectedSiteId ? { siteId: selectedSiteId } : {}),
          payload: defaultPayload(templateForm.name),
        });
        setTemplates((current) => [created, ...current]);
        setNotice('Template metadata created.');
      }
      setEditingTemplateId('');
      setTemplateForm(blankTemplate);
    });
  }

  async function removeAsset(assetId: string) {
    if (!session) return;
    await runBusy(async () => {
      await api.delete(`/workspaces/${session.workspace.id}/assets/${assetId}`);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setNotice('Asset removed.');
    });
  }

  async function removeTemplate(templateId: string) {
    if (!session) return;
    await runBusy(async () => {
      await api.delete(`/workspaces/${session.workspace.id}/templates/${templateId}`);
      setTemplates((current) => current.filter((template) => template.id !== templateId));
      setNotice('Template removed.');
    });
  }

  async function publishTemplate(template: Template, versionNumber?: number) {
    if (!session) return;
    await runBusy(async () => {
      const updated = await api.post<Template>(
        `/workspaces/${session.workspace.id}/templates/${template.id}/publish`,
        versionNumber ? { versionNumber } : {},
      );
      setTemplates((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setNotice(`Published ${template.name} version ${versionNumber ?? 'latest'}.`);
    });
  }

  async function duplicateTemplate(template: Template) {
    if (!session) return;
    await runBusy(async () => {
      const created = await api.post<Template>(
        `/workspaces/${session.workspace.id}/templates`,
        {
          name: `${template.name} copy`,
          ...(template.description ? { description: template.description } : {}),
          ...(template.siteId ? { siteId: template.siteId } : {}),
          payload: template.payload,
          ...(template.layoutAttachments
            ? { layoutAttachments: template.layoutAttachments }
            : {}),
        },
      );
      setTemplates((current) => [created, ...current]);
      setNotice(`Created an independent copy of ${template.name}.`);
    });
  }

  async function restoreTemplateVersion(template: Template, version: TemplateVersion) {
    if (!session) return;
    await runBusy(async () => {
      const updated = await api.patch<Template>(
        `/workspaces/${session.workspace.id}/templates/${template.id}`,
        {
          payload: version.payload,
          layoutAttachments: version.layoutAttachments ?? [],
        },
      );
      setTemplates((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setNotice(
        `Created a new draft from ${template.name} version ${version.versionNumber}.`,
      );
    });
  }

  function beginPageFromTemplate(templateId: string, templateVersionId?: string) {
    if (!selectedSiteId) {
      setView('pages');
      setNotice('Select a site, then choose this template while creating a page.');
      return;
    }
    setSelectedPageId('');
    setPageForm(blankPage);
    setPageTemplateId(templateId);
    setPageTemplateVersionId(templateVersionId ?? null);
    setPageDrawerOpen(true);
    setView('pages');
  }

  async function handleDomainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await runBusy(async () => {
      const created = await api.post<CustomDomain>(
        `/workspaces/${session.workspace.id}/domains`,
        {
          hostname: domainForm.hostname,
          ...(domainForm.siteId ? { siteId: domainForm.siteId } : {}),
          ...(domainForm.landingPageId
            ? { landingPageId: domainForm.landingPageId }
            : {}),
          ...(domainForm.isPrimary ? { isPrimary: true } : {}),
        },
      );
      setDomains((current) => [created, ...current]);
      setDomainForm(blankDomain);
      setNotice('Domain added. Add the DNS TXT record before verifying it.');
    });
  }

  async function verifyDomain(domain: CustomDomain) {
    if (!session) return;
    await runBusy(async () => {
      const updated = await api.post<CustomDomain>(
        `/workspaces/${session.workspace.id}/domains/${domain.id}/verify`,
      );
      setDomains((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        updated.status === 'active'
          ? 'Domain verified and active.'
          : 'Verification record not found yet.',
      );
    });
  }

  async function updateDomain(
    domain: CustomDomain,
    input: { landingPageId: string | null; isPrimary: boolean },
  ) {
    if (!session) return;
    await runBusy(async () => {
      const updated = await api.patch<CustomDomain>(
        `/workspaces/${session.workspace.id}/domains/${domain.id}`,
        input,
      );
      setDomains((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Domain assignment updated.');
    });
  }

  async function removeDomain(domain: CustomDomain) {
    if (
      !session ||
      !window.confirm(`Remove ${domain.hostname}? It will stop serving immediately.`)
    )
      return;
    await runBusy(async () => {
      await api.delete(`/workspaces/${session.workspace.id}/domains/${domain.id}`);
      setDomains((current) => current.filter((item) => item.id !== domain.id));
      setNotice('Domain removed.');
    });
  }

  async function saveNavigation(input: {
    id?: string;
    key: string;
    name: string;
    items: NavigationItem[];
  }) {
    if (!selectedSiteId) return;
    await runBusy(async () => {
      const response = input.id
        ? await api.patch(`/sites/${selectedSiteId}/navigations/${input.id}`, {
            name: input.name,
            items: input.items,
          })
        : await api.post(`/sites/${selectedSiteId}/navigations`, {
            key: input.key,
            name: input.name,
            items: input.items,
          });
      const saved = NavigationSchema.parse(response);
      setNavigations((current) =>
        input.id
          ? current.map((navigation) => (navigation.id === saved.id ? saved : navigation))
          : [...current, saved],
      );
      setNotice('Navigation saved.');
    });
  }

  async function removeNavigation(navigation: Navigation) {
    if (!selectedSiteId || !window.confirm(`Delete ${navigation.name}?`)) return;
    await runBusy(async () => {
      await api.delete(`/sites/${selectedSiteId}/navigations/${navigation.id}`);
      setNavigations((current) => current.filter((item) => item.id !== navigation.id));
      setNotice('Navigation deleted.');
    });
  }

  async function handleSeoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPageId) return;
    await runBusy(async () => {
      const formData = new FormData(event.currentTarget);
      const text = (name: string) => {
        const value = formData.get(name);
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      };
      const card = formData.get('twitterCard');
      const saved = await api.patch<PageSeoSettings>(`/pages/${selectedPageId}/seo`, {
        title: text('title'),
        description: text('description'),
        canonicalUrl: text('canonicalUrl'),
        noIndex: formData.get('noIndex') === 'on',
        noFollow: formData.get('noFollow') === 'on',
        ogTitle: text('ogTitle'),
        ogDescription: text('ogDescription'),
        ogImage: text('ogImage'),
        twitterCard:
          card === 'summary_large_image' ? card : card === 'summary' ? card : null,
        twitterTitle: text('twitterTitle'),
        twitterDescription: text('twitterDescription'),
        twitterImage: text('twitterImage'),
        favicon: text('favicon'),
      });
      setSeoSettings(saved);
      setNotice('SEO settings saved.');
    });
  }

  async function runBusy(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
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
  if (!session) return <main className="loading-page">Redirecting to sign in…</main>;

  const navigationSections: Array<{
    label: string;
    items: Array<{ key: View; label: string; icon: string }>;
  }> = [
    {
      label: 'Workspace',
      items: [
        { icon: '⌂', key: 'dashboard' as const, label: 'Dashboard' },
        ...(can('workspace.read')
          ? [{ icon: '▦', key: 'organization' as const, label: 'Organization' }]
          : []),
        ...(can('site.read')
          ? [{ icon: '◫', key: 'sites' as const, label: 'Sites' }]
          : []),
        ...(can('page.read')
          ? [{ icon: '▤', key: 'pages' as const, label: 'Pages' }]
          : []),
        ...(can('collection.read')
          ? [{ icon: '▥', key: 'collections' as const, label: 'Collections' }]
          : []),
        ...(can('site.read')
          ? [{ icon: '≡', key: 'navigation' as const, label: 'Navigation' }]
          : []),
        ...(can('design-system.read')
          ? [{ icon: '✦', key: 'design-system' as const, label: 'Design system' }]
          : []),
        ...(can('asset.read')
          ? [{ icon: '◈', key: 'assets' as const, label: 'Assets' }]
          : []),
        ...(can('template.read')
          ? [{ icon: '◇', key: 'templates' as const, label: 'Templates' }]
          : []),
        ...(can('lead.read')
          ? [{ icon: '✉', key: 'submissions' as const, label: 'Submissions' }]
          : []),
      ],
    },
    {
      label: 'Operations',
      items: [
        ...(can('workflow.read')
          ? [{ icon: '⤢', key: 'workflows' as const, label: 'Workflows' }]
          : []),
        ...(can('integration.read')
          ? [{ icon: '↔', key: 'integrations' as const, label: 'Integrations' }]
          : []),
        ...(can('analytics.read')
          ? [{ icon: '◒', key: 'analytics' as const, label: 'Analytics' }]
          : []),
        ...(can('domain.read')
          ? [{ icon: '⌁', key: 'domains' as const, label: 'Domains' }]
          : []),
        ...(can('seo.read') ? [{ icon: '⌕', key: 'seo' as const, label: 'SEO' }] : []),
      ],
    },
    {
      label: 'Management',
      items: [
        ...(can('billing.read')
          ? [{ icon: '$', key: 'billing' as const, label: 'Billing & Usage' }]
          : []),
        ...(can('user.read')
          ? [{ icon: '●', key: 'users' as const, label: 'Users' }]
          : []),
        ...(can('role.read')
          ? [{ icon: '◆', key: 'roles' as const, label: 'Roles' }]
          : []),
        ...(can('audit.read')
          ? [{ icon: '≡', key: 'audit' as const, label: 'Audit Log' }]
          : []),
        ...(can('extensions.read') || can('layout.read')
          ? [{ icon: '⊞', key: 'extensions' as const, label: 'Extensions' }]
          : []),
      ],
    },
  ].filter((section) => section.items.length > 0);

  const currentOrganization = organizations.find(
    (organization) => organization.id === session.workspace.organizationId,
  );
  const currentCompanyName =
    currentOrganization?.name ?? session.user.tenantSlug ?? 'Current company';

  return (
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
          {navigationSections.map((section) => (
            <div className="nav-section" key={section.label}>
              <span className="nav-section-label">{section.label}</span>
              {section.items.map((item) => (
                <button
                  aria-current={view === item.key ? 'page' : undefined}
                  className={view === item.key ? 'nav-item active' : 'nav-item'}
                  key={item.key}
                  onClick={() => {
                    setView(item.key);
                    setMobileSidebarOpen(false);
                  }}
                  title={sidebarCollapsed ? item.label : undefined}
                  type="button"
                >
                  <span aria-hidden="true" className="nav-icon">
                    {item.icon}
                  </span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="content-area">
        <AppHeader
          companyName={currentCompanyName}
          currentWorkspaceId={session.workspace.id}
          mobileSidebarOpen={mobileSidebarOpen}
          onLogout={() => void handleLogout()}
          onOpenSidebar={() => setMobileSidebarOpen((current) => !current)}
          onSwitchWorkspace={(workspaceId) =>
            void switchContext(session.workspace.organizationId, workspaceId)
          }
          userEmail={session.user.email}
          workspaces={workspaces}
        />
        <section className="content-inner">
          {error ? (
            <div className="alert alert-error" role="alert">
              <div>
                <strong>We couldn’t load this workspace.</strong>
                <span className="muted">{error}</span>
              </div>
              <button
                className="button button-small button-ghost"
                onClick={() => void bootstrap()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {notice ? (
            <div aria-live="polite" className="alert alert-success" role="status">
              {notice}
            </div>
          ) : null}
          {view === 'organization' ? (
            <OrganizationView
              busy={busy}
              canAddMember={can('member.add')}
              canCreateOrganization={can('workspace.create')}
              canCreateWorkspace={can('workspace.create')}
              canRemoveMember={can('member.remove')}
              canUpdateMember={can('member.update')}
              members={organizationMembers}
              memberRole={newMemberRole}
              memberUserId={newMemberUserId}
              name={organizationName}
              onAddMember={addOrganizationMember}
              onChangeMemberRole={(member, role) =>
                void updateOrganizationMember(member, role)
              }
              onCreate={createOrganization}
              onCreateWorkspace={createWorkspaceForOrganization}
              onRemoveMember={(member) => void removeOrganizationMember(member)}
              onSelectOrganization={setManagementOrganizationId}
              onSetName={setOrganizationName}
              onSetMemberRole={setNewMemberRole}
              onSetMemberUserId={setNewMemberUserId}
              onSetSlug={setOrganizationSlug}
              onSetWorkspaceName={setNewWorkspaceName}
              organizations={organizations}
              selectedOrganizationId={managementOrganizationId}
              slug={organizationSlug}
              workspaceName={newWorkspaceName}
              workspaces={workspaces}
            />
          ) : null}
          {view === 'dashboard' ? (
            <Dashboard counts={counts} onNavigate={setView} sites={sites} />
          ) : null}
          {view === 'sites' ? (
            <SitesView
              onCreate={() => {
                setEditingSiteId('');
                setSiteForm(blankSite);
                setSiteDrawerOpen(true);
              }}
              onEdit={(site) => {
                setEditingSiteId(site.id);
                setSiteForm({ name: site.name, slug: site.slug });
                setSiteDrawerOpen(true);
              }}
              onPublish={(site) => void publishSite(site)}
              onPage={(offset) => void refreshSites(offset)}
              pagination={sitePagination}
              paging={sitePaging}
              sites={sites}
              canPublish={can('page.publish')}
            />
          ) : null}
          {view === 'sites' ? (
            <Drawer
              description="The slug is the stable public URL for this site."
              eyebrow={editingSiteId ? 'Site settings' : 'New site'}
              footer={
                <div className="form-actions">
                  <button
                    className="button button-primary"
                    disabled={
                      busy || (editingSiteId ? !can('site.update') : !can('site.create'))
                    }
                    form="site-metadata-form"
                    type="submit"
                  >
                    {busy ? 'Saving…' : editingSiteId ? 'Save changes' : 'Create site'}
                  </button>
                  <button
                    className="button button-ghost"
                    onClick={() => setSiteDrawerOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              }
              onClose={() => setSiteDrawerOpen(false)}
              open={siteDrawerOpen}
              title={editingSiteId ? 'Edit site' : 'Create site'}
            >
              <form className="stack" id="site-metadata-form" onSubmit={handleSiteSubmit}>
                <label>
                  Site name
                  <input
                    aria-label="Site name"
                    name="name"
                    onChange={(event) =>
                      setSiteForm({ ...siteForm, name: event.target.value })
                    }
                    required
                    value={siteForm.name}
                  />
                </label>
                <label>
                  Slug
                  <span className="muted">Public site URL segment</span>
                  <input
                    aria-label="Slug"
                    name="slug"
                    onChange={(event) =>
                      setSiteForm({
                        ...siteForm,
                        slug: normalizeUrlSlug(event.target.value),
                      })
                    }
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="my-site"
                    required
                    value={siteForm.slug}
                  />
                </label>
                <p className="helper-text">
                  Public URL: <code>/{siteForm.slug || 'site-slug'}</code>
                </p>
              </form>
            </Drawer>
          ) : null}
          {view === 'pages' ? (
            <SiteMapPagesView
              busy={busy}
              canCreatePage={can('page.create')}
              canUpdatePage={can('page.update')}
              canPublishPage={can('page.publish')}
              canDeletePage={can('page.delete')}
              canReadWorkflows={can('workflow.read')}
              onCreatePage={() => {
                if (!selectedSiteId || !can('page.create')) return;
                setSelectedPageId('');
                setPageForm(blankPage);
                setPageTemplateId(null);
                setPageTemplateVersionId(null);
                setPageDrawerOpen(true);
              }}
              onOpenBuilder={(page) =>
                router.push(
                  `/workspaces/${session.workspace.id}/sites/${page.siteId}/pages/${page.id}/builder`,
                )
              }
              onEditPage={(page) => {
                setSelectedPageId(page.id);
                setPageForm({
                  name: page.name,
                  description: page.description ?? '',
                  path: page.path,
                });
                setPageDrawerOpen(true);
              }}
              onOpenWorkflows={(page) => {
                setSelectedPageId(page.id);
                setView('workflows');
              }}
              onOpenSeo={(page) => {
                setSelectedPageId(page.id);
                setView('seo');
              }}
              onDuplicate={(page) => void duplicatePage(page)}
              onDelete={(page) => void removePage(page)}
              onSetHomepage={(page) => void setHomepage(page)}
              onPreview={previewPage}
              onPublish={(page) => void publishPage(page)}
              onSelectPage={(page) => {
                setSelectedPageId(page.id);
                setPageTemplateId(null);
                setPageTemplateVersionId(null);
                setPageForm({
                  name: page.name,
                  description: page.description ?? '',
                  path: page.path,
                });
                setPageDrawerOpen(true);
              }}
              onSelectSite={setSelectedSiteId}
              onUnpublish={(page) => void unpublishPage(page)}
              pages={pages}
              pageDrawerOpen={pageDrawerOpen}
              pageForm={pageForm}
              onPageFormChange={setPageForm}
              onPageSubmit={handlePageSubmit}
              onClosePageDrawer={() => setPageDrawerOpen(false)}
              onChooseTemplate={(template) => {
                setPageTemplateId(template.id);
                setPageTemplateVersionId(null);
              }}
              selectedPage={selectedPage}
              selectedSite={selectedSite}
              selectedSiteId={selectedSiteId}
              sites={sites}
              templates={templates}
              versions={versions}
              bindings={formBindings}
              bindingSaving={bindingSaving}
              integrations={integrations}
              onSaveFormBinding={(formNodeId, integrationIds) =>
                void saveFormBinding(formNodeId, integrationIds)
              }
            />
          ) : null}
          {view === 'collections' ? (
            <CollectionsView
              canCreate={can('collection.create') && can('entry.create')}
              canDelete={can('collection.delete')}
              canPublish={can('entry.publish')}
              canUpdate={can('collection.update') && can('entry.update')}
              selectedSiteId={selectedSiteId}
              sites={sites}
              workspaceId={session.workspace.id}
            />
          ) : null}
          {view === 'navigation' ? (
            <NavigationView
              busy={busy}
              canUpdate={can('site.update')}
              navigations={navigations}
              onRemove={(navigation) => void removeNavigation(navigation)}
              onSave={(input) => void saveNavigation(input)}
              onSelectSite={setSelectedSiteId}
              pages={pages}
              selectedSiteId={selectedSiteId}
              sites={sites}
            />
          ) : null}
          {view === 'design-system' ? (
            selectedSiteId ? (
              <DesignSystemView
                canUpdate={can('design-system.update')}
                siteId={selectedSiteId}
                workspaceId={session.workspace.id}
              />
            ) : (
              <section className="panel">
                <p>Select a site to manage its design system.</p>
              </section>
            )
          ) : null}
          {view === 'assets' ? (
            <AssetsView
              assets={assets}
              busy={busy}
              form={assetForm}
              onChange={setAssetForm}
              onRemove={(id) => void removeAsset(id)}
              onSubmit={handleAssetSubmit}
            />
          ) : null}
          {view === 'templates' ? (
            <TemplatesView
              busy={busy}
              canCreate={can('template.create')}
              canDelete={can('template.delete')}
              canPublish={can('template.publish')}
              canUpdate={can('template.update')}
              editingTemplateId={editingTemplateId}
              form={templateForm}
              onCancel={() => {
                setEditingTemplateId('');
                setTemplateForm(blankTemplate);
              }}
              onChange={setTemplateForm}
              onEdit={(template) => {
                setEditingTemplateId(template.id);
                setTemplateForm({
                  description: template.description ?? '',
                  name: template.name,
                });
              }}
              onRemove={(id) => void removeTemplate(id)}
              onDuplicate={(template) => void duplicateTemplate(template)}
              onPublish={(template, versionNumber) =>
                void publishTemplate(template, versionNumber)
              }
              onRestore={(template, version) =>
                void restoreTemplateVersion(template, version)
              }
              onSubmit={handleTemplateSubmit}
              onUseForPage={beginPageFromTemplate}
              onOpenBuilder={(template, versionNumber) => {
                if (!selectedSiteId) {
                  setNotice('Select a site before opening the Template builder.');
                  return;
                }
                const versionQuery = versionNumber
                  ? `?version=${encodeURIComponent(String(versionNumber))}`
                  : '';
                router.push(
                  `/workspaces/${session.workspace.id}/sites/${selectedSiteId}/templates/${template.id}/builder${versionQuery}`,
                );
              }}
              siteId={selectedSiteId}
              workspaceId={session.workspace.id}
              templates={templates}
            />
          ) : null}
          {view === 'submissions' ? (
            <SubmissionsView
              onNext={() =>
                void refreshSubmissions(submissionPage.offset + submissionPage.limit)
              }
              onPrevious={() =>
                void refreshSubmissions(
                  Math.max(0, submissionPage.offset - submissionPage.limit),
                )
              }
              onSearch={setSubmissionSearch}
              onSelect={setSelectedSubmission}
              onStatusFilter={setSubmissionStatus}
              onUpdateStatus={(submission, status) =>
                void updateSubmissionStatus(submission, status)
              }
              page={submissionPage}
              search={submissionSearch}
              selected={selectedSubmission}
              status={submissionStatus}
              submissions={submissions}
            />
          ) : null}
          {view === 'integrations' ? (
            <IntegrationsView
              initialIntegrations={integrations}
              onIntegrationsChanged={setIntegrations}
              workspaceId={session.workspace.id}
            />
          ) : null}
          {view === 'analytics' ? (
            <AnalyticsView workspaceId={session.workspace.id} />
          ) : null}
          {view === 'domains' ? (
            <DomainsView
              busy={busy}
              domains={domains}
              form={domainForm}
              onChange={setDomainForm}
              onRemove={(domain) => void removeDomain(domain)}
              onSubmit={handleDomainSubmit}
              onUpdate={(domain, input) => void updateDomain(domain, input)}
              onVerify={(domain) => void verifyDomain(domain)}
              pages={pages}
              sites={sites}
            />
          ) : null}
          {view === 'seo' ? (
            <SeoView
              busy={busy}
              onSave={handleSeoSubmit}
              onSelectPage={(pageId) => {
                setSelectedPageId(pageId);
                const page = pages.find((candidate) => candidate.id === pageId);
                if (page)
                  setPageForm({
                    name: page.name,
                    description: page.description ?? '',
                    path: page.path,
                  });
              }}
              pages={pages}
              selectedPageId={selectedPageId}
              settings={seoSettings}
            />
          ) : null}
          {view === 'billing' ? <BillingView workspaceId={session.workspace.id} /> : null}
          {view === 'users' ? (
            <UsersView
              busy={busy}
              canAssign={can('role.assign')}
              canCreate={can('user.create')}
              canDisable={can('user.disable')}
              canRemove={can('user.remove')}
              canUpdate={can('user.update')}
              currentUserEmail={session.user.email}
              onAssign={(userId, input) => assignUserRole(userId, input)}
              onCreate={(input) => void createUser(input)}
              onLoadDetail={loadUserDetail}
              onPage={(offset) =>
                void refreshUsers(
                  { search: userSearch || undefined, status: userStatus },
                  offset,
                )
              }
              onRemove={(userId) => removeUser(userId)}
              onSearch={(input) => void refreshUsers(input)}
              onStatus={(userId, status) => changeUserStatus(userId, status)}
              onUnassign={(userId, assignmentId) =>
                unassignUserRole(userId, assignmentId)
              }
              onUpdate={(userId, input) => updateUser(userId, input)}
              pagination={userPagination}
              roles={roles}
              users={users}
              workspaces={workspaces}
            />
          ) : null}
          {view === 'roles' ? (
            <RolesView
              canAssign={can('role.assign')}
              canManage={can('role.create') && can('role.update')}
              currentUserId={session.user.email}
              onAssign={(input) => void assignRole(input)}
              onCreate={(input) => void createRole(input)}
              onUpdate={(roleId, input) => void updateRole(roleId, input)}
              roles={roles}
              workspaceId={session.workspace.id}
            />
          ) : null}
          {view === 'audit' ? (
            <AuditView
              auditLogs={auditLogs}
              onNext={() =>
                void refreshAudit(auditPagination.offset + auditPagination.limit, {
                  action: auditActionFilter || undefined,
                  resourceType: auditResourceFilter || undefined,
                })
              }
              onPrevious={() =>
                void refreshAudit(
                  Math.max(0, auditPagination.offset - auditPagination.limit),
                  {
                    action: auditActionFilter || undefined,
                    resourceType: auditResourceFilter || undefined,
                  },
                )
              }
              actionFilter={auditActionFilter}
              pagination={auditPagination}
              onFilter={(filters) => {
                setAuditActionFilter(filters.action);
                setAuditResourceFilter(filters.resourceType);
              }}
              resourceFilter={auditResourceFilter}
            />
          ) : null}
          {view === 'extensions' ? (
            <ExtensionsView
              canManage={can('extensions.manage')}
              canManageLayouts={can('layout.create')}
              canDeleteLayouts={can('layout.delete')}
              workspaceId={session.workspace.id}
              {...(selectedSiteId ? { siteId: selectedSiteId } : {})}
            />
          ) : null}
          {view === 'workflows' ? (
            <WorkflowsView
              canEnable={can('workflow.enable') || can('workflow.disable')}
              canManage={can('workflow.create') && can('workflow.update')}
              canPublish={can('workflow.publish')}
              canReadExecutions={can('workflow.execution.read')}
              canRetry={can('workflow.execution.retry')}
              {...(selectedPageId ? { pageId: selectedPageId } : {})}
              workspaceId={session.workspace.id}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function OrganizationView({
  organizations,
  selectedOrganizationId,
  workspaces,
  members,
  memberRole,
  memberUserId,
  name,
  slug,
  workspaceName,
  busy,
  onSelectOrganization,
  onCreate,
  onSetName,
  onSetMemberRole,
  onSetMemberUserId,
  onSetSlug,
  onCreateWorkspace,
  onSetWorkspaceName,
  onAddMember,
  onChangeMemberRole,
  onRemoveMember,
  canAddMember,
  canCreateOrganization,
  canCreateWorkspace,
  canRemoveMember,
  canUpdateMember,
}: {
  organizations: Organization[];
  selectedOrganizationId: string;
  workspaces: Workspace[];
  members: OrganizationMembership[];
  memberRole: 'admin' | 'member';
  memberUserId: string;
  name: string;
  slug: string;
  workspaceName: string;
  busy: boolean;
  onSelectOrganization: (id: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onSetName: (value: string) => void;
  onSetMemberRole: (value: 'admin' | 'member') => void;
  onSetMemberUserId: (value: string) => void;
  onSetSlug: (value: string) => void;
  onCreateWorkspace: (event: FormEvent<HTMLFormElement>) => void;
  onSetWorkspaceName: (value: string) => void;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onChangeMemberRole: (
    member: OrganizationMembership,
    role: OrganizationMembership['role'],
  ) => void;
  onRemoveMember: (member: OrganizationMembership) => void;
  canAddMember: boolean;
  canCreateOrganization: boolean;
  canCreateWorkspace: boolean;
  canRemoveMember: boolean;
  canUpdateMember: boolean;
}) {
  const organization = organizations.find((item) => item.id === selectedOrganizationId);
  return (
    <>
      <PageHeading
        eyebrow="Organization"
        title={organization?.name ?? 'Organizations'}
        description="Manage organization ownership, workspaces and members."
      />
      <div className="toolbar">
        <label className="inline-field">
          Organization
          <select
            aria-label="Organization management context"
            onChange={(event) => onSelectOrganization(event.target.value)}
            value={selectedOrganizationId}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-column">
        <section className="panel">
          <PanelTitle title="Create an organization" />
          {canCreateOrganization ? (
            <form className="stack" onSubmit={onCreate}>
              <label>
                Organization name
                <input
                  value={name}
                  onChange={(event) => onSetName(event.target.value)}
                  required
                />
              </label>
              <label>
                Slug <span className="muted">(optional)</span>
                <input value={slug} onChange={(event) => onSetSlug(event.target.value)} />
              </label>
              <button className="button button-primary" disabled={busy} type="submit">
                Create organization
              </button>
            </form>
          ) : (
            <p className="muted">You do not have permission to create organizations.</p>
          )}
        </section>
        <section className="panel">
          <PanelTitle title="Workspaces" count={workspaces.length} />
          {canCreateWorkspace ? (
            <form className="form-actions" onSubmit={onCreateWorkspace}>
              <input
                aria-label="New workspace name"
                onChange={(event) => onSetWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                required
                value={workspaceName}
              />
              <button className="button button-secondary" disabled={busy} type="submit">
                Add workspace
              </button>
            </form>
          ) : (
            <p className="muted">
              Workspace creation is restricted to workspace administrators.
            </p>
          )}
          {workspaces.length ? (
            <div className="list">
              {workspaces.map((workspace) => (
                <div className="list-row" key={workspace.id}>
                  <strong>{workspace.name}</strong>
                  <span className="muted">{workspace.id.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No workspaces"
              description="Create a workspace for this organization."
            />
          )}
        </section>
      </div>
      <section className="panel">
        <PanelTitle title="Members" count={members.length} />
        {canAddMember ? (
          <form className="form-actions" onSubmit={onAddMember}>
            <input
              aria-label="Member user id"
              onChange={(event) => onSetMemberUserId(event.target.value)}
              placeholder="Existing user id or email"
              required
              value={memberUserId}
            />
            <select
              aria-label="Member role"
              onChange={(event) =>
                onSetMemberRole(event.target.value as 'admin' | 'member')
              }
              value={memberRole}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button className="button button-secondary" disabled={busy} type="submit">
              Add member
            </button>
          </form>
        ) : (
          <p className="muted">You do not have permission to add members.</p>
        )}
        {members.length ? (
          <div className="list">
            {members.map((member) => (
              <div className="list-row" key={member.id}>
                <div>
                  <strong>{member.userId}</strong>
                  <span className="muted">{member.role}</span>
                </div>
                <div className="row-actions">
                  {canUpdateMember && member.role !== 'owner' ? (
                    <select
                      aria-label={`Role for ${member.userId}`}
                      onChange={(event) =>
                        onChangeMemberRole(
                          member,
                          event.target.value as OrganizationMembership['role'],
                        )
                      }
                      value={member.role}
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  ) : null}
                  {canRemoveMember ? (
                    <button
                      className="button button-small button-danger"
                      onClick={() => onRemoveMember(member)}
                      type="button"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No members"
            description="The organization has no readable members."
          />
        )}
      </section>
    </>
  );
}

function Dashboard({
  counts,
  onNavigate,
  sites,
}: {
  counts: Record<string, number>;
  onNavigate: (view: View) => void;
  sites: Site[];
}) {
  return (
    <>
      <PageHeading
        eyebrow="Overview"
        title="Good morning"
        description="A focused workspace for managing your page inventory."
      />
      <div className="metric-grid">
        {(
          [
            ['sites', 'Sites', counts.sites],
            ['pages', 'Pages', counts.pages],
            ['assets', 'Assets', counts.assets],
            ['templates', 'Templates', counts.templates],
          ] as const
        ).map(([target, label, value]) => (
          <button
            className="metric-card"
            key={label}
            onClick={() => onNavigate(target)}
            type="button"
          >
            <span className="muted">{label}</span>
            <strong>{value}</strong>
            <span className="linkish">Manage →</span>
          </button>
        ))}
      </div>
      <section className="panel">
        <PanelTitle title="Sites at a glance" />
        <p className="muted">
          {sites.length
            ? 'Your most recently available sites.'
            : 'Create your first site to start organizing pages.'}
        </p>
        {sites.length ? (
          <div className="list">
            {sites.slice(0, 5).map((site) => (
              <div className="list-row" key={site.id}>
                <div>
                  <strong>{site.name}</strong>
                  <span className="muted">/{site.slug}</span>
                </div>
                <span className="pill">Ready</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

function SitesView({
  sites,
  pagination,
  paging,
  onCreate,
  onEdit,
  onPublish,
  onPage,
  canPublish,
}: {
  sites: Site[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasNextPage: boolean;
  };
  paging: boolean;
  onCreate: () => void;
  onEdit: (site: Site) => void;
  onPublish: (site: Site) => void;
  onPage: (offset: number) => void;
  canPublish: boolean;
}) {
  return (
    <>
      <PageHeader
        actions={
          <button className="button button-primary" onClick={onCreate} type="button">
            New site
          </button>
        }
        eyebrow="Workspace"
        title="Sites"
        description="Create and maintain the destinations that own your pages."
      />
      <section className="panel">
        <PanelTitle title="Your sites" count={pagination.total} />
        {sites.length ? (
          <div className="table-shell">
            <table className="resource-table">
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Public URL</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td>
                      <strong>{site.name}</strong>
                      <span className="table-secondary">/{site.slug}</span>
                    </td>
                    <td>
                      {site.officialUrl ? (
                        <a
                          className="text-link"
                          href={site.officialUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {site.officialUrl} ↗
                        </a>
                      ) : (
                        <span className="muted">Not published</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={site.status} />
                    </td>
                    <td>
                      <div className="row-menu">
                        <button
                          className="button button-small button-ghost"
                          onClick={() => onEdit(site)}
                          title={`Edit ${site.name}`}
                          type="button"
                        >
                          Edit
                        </button>
                        {canPublish ? (
                          <button
                            className="button button-small button-primary"
                            disabled={site.status === 'published'}
                            onClick={() => onPublish(site)}
                            title={`Publish ${site.name}`}
                            type="button"
                          >
                            {site.status === 'published' ? 'Published' : 'Publish site'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No sites found"
            description="Your site list will appear here."
          />
        )}
        {pagination.total > 0 ? (
          <PaginationControls
            busy={paging}
            className="site-pagination"
            noun="sites"
            onNext={() => onPage(pagination.offset + pagination.limit)}
            onPrevious={() => onPage(Math.max(0, pagination.offset - pagination.limit))}
            pagination={pagination}
          />
        ) : null}
      </section>
    </>
  );
}

function AssetsView({
  assets,
  form,
  busy,
  onChange,
  onSubmit,
  onRemove,
}: {
  assets: Asset[];
  form: AssetForm;
  busy: boolean;
  onChange: (form: AssetForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (assetId: string) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Library"
        title="Assets"
        description="Keep track of asset metadata and storage references used by the workspace."
      />
      <div className="two-column">
        <section className="panel">
          <PanelTitle title="Add asset metadata" />
          <p className="muted small">
            Binary upload and processing are intentionally deferred.
          </p>
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Filename
              <input
                onChange={(event) => onChange({ ...form, filename: event.target.value })}
                required
                value={form.filename}
              />
            </label>
            <label>
              MIME type
              <input
                onChange={(event) => onChange({ ...form, mimeType: event.target.value })}
                required
                value={form.mimeType}
              />
            </label>
            <label>
              Size in bytes
              <input
                min="0"
                onChange={(event) => onChange({ ...form, size: event.target.value })}
                required
                type="number"
                value={form.size}
              />
            </label>
            <label>
              Storage key
              <input
                onChange={(event) =>
                  onChange({ ...form, storageKey: event.target.value })
                }
                required
                value={form.storageKey}
              />
            </label>
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Add asset'}
            </button>
          </form>
        </section>
        <section className="panel">
          <PanelTitle title="Asset inventory" count={assets.length} />
          {assets.length ? (
            <div className="list">
              {assets.map((asset) => (
                <div className="list-row" key={asset.id}>
                  <div>
                    <strong>{asset.filename}</strong>
                    <span className="muted">
                      {asset.mimeType} · {asset.size} bytes
                    </span>
                  </div>
                  <button
                    className="button button-small button-danger"
                    onClick={() => onRemove(asset.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No assets"
              description="Add metadata for an asset to see it here."
            />
          )}
        </section>
      </div>
    </>
  );
}

function TemplatesView({
  templates,
  form,
  busy,
  canCreate,
  canDelete,
  canPublish,
  canUpdate,
  editingTemplateId,
  onChange,
  onSubmit,
  onEdit,
  onRemove,
  onDuplicate,
  onPublish,
  onRestore,
  onCancel,
  onUseForPage,
  onOpenBuilder,
  siteId,
  workspaceId,
}: {
  templates: Template[];
  form: TemplateForm;
  busy: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  editingTemplateId: string;
  onChange: (form: TemplateForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (template: Template) => void;
  onRemove: (templateId: string) => void;
  onDuplicate: (template: Template) => void;
  onPublish: (template: Template, versionNumber?: number) => void;
  onRestore: (template: Template, version: TemplateVersion) => void;
  onCancel: () => void;
  onUseForPage: (templateId: string, templateVersionId?: string) => void;
  onOpenBuilder: (template: Template, versionNumber?: number) => void;
  siteId: string;
  workspaceId: string;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Library"
        title="Templates"
        description="Manage reusable payload snapshots and their descriptive metadata."
      />
      <div className="two-column">
        <section className="panel">
          <PanelTitle
            title={editingTemplateId ? 'Edit template metadata' : 'Create a template'}
          />
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Template name
              <input
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label>
              Description <span className="muted">(optional)</span>
              <textarea
                onChange={(event) =>
                  onChange({ ...form, description: event.target.value })
                }
                rows={3}
                value={form.description}
              />
            </label>
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={busy || (editingTemplateId ? !canUpdate : !canCreate)}
                type="submit"
              >
                {busy
                  ? 'Saving…'
                  : editingTemplateId
                    ? 'Save metadata'
                    : 'Create template'}
              </button>
              {editingTemplateId ? (
                <button className="button button-ghost" onClick={onCancel} type="button">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
        <section className="panel">
          <PanelTitle title="Template inventory" count={templates.length} />
          {templates.length ? (
            <div className="list">
              {templates.map((template) => (
                <div className="list-row" key={template.id}>
                  <div>
                    <strong>{template.name}</strong>
                    <span className="muted">
                      {template.description || 'No description'}
                    </span>
                    <span className="muted small">
                      {template.publishedVersionId ? 'Published' : 'Draft only'}
                    </span>
                    <TemplateVersions
                      busy={busy}
                      canPublish={canPublish}
                      canUpdate={canUpdate}
                      onReview={onOpenBuilder}
                      onPublish={onPublish}
                      onRestore={onRestore}
                      onUseForPage={onUseForPage}
                      template={template}
                      workspaceId={workspaceId}
                    />
                  </div>
                  <div className="row-actions">
                    <button
                      className="button button-small button-primary"
                      onClick={() => onUseForPage(template.id)}
                      type="button"
                    >
                      Use for page
                    </button>
                    <button
                      className="button button-small button-secondary"
                      disabled={!siteId || !canUpdate}
                      onClick={() => onOpenBuilder(template)}
                      title={
                        siteId ? 'Open visual template builder' : 'Select a site first'
                      }
                      type="button"
                    >
                      Open builder
                    </button>
                    <button
                      className="button button-small button-success"
                      disabled={busy || !canPublish}
                      onClick={() => onPublish(template)}
                      type="button"
                    >
                      Publish
                    </button>
                    <button
                      className="button button-small"
                      disabled={!canUpdate}
                      onClick={() => onEdit(template)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="button button-small"
                      disabled={busy || !canCreate}
                      onClick={() => onDuplicate(template)}
                      type="button"
                    >
                      Duplicate
                    </button>
                    <button
                      className="button button-small button-danger"
                      disabled={!canDelete}
                      onClick={() => onRemove(template.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No templates"
              description="Create a template metadata record to get started."
            />
          )}
        </section>
      </div>
    </>
  );
}

function TemplateVersions({
  busy,
  canPublish,
  canUpdate,
  onReview,
  onPublish,
  onRestore,
  onUseForPage,
  template,
  workspaceId,
}: {
  busy: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  onReview: (template: Template, versionNumber?: number) => void;
  onPublish: (template: Template, versionNumber?: number) => void;
  onRestore: (template: Template, version: TemplateVersion) => void;
  onUseForPage: (templateId: string, templateVersionId?: string) => void;
  template: Template;
  workspaceId: string;
}) {
  const [versions, setVersions] = useState<TemplateVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    if (versions) {
      setVersions(null);
      return;
    }
    setError(null);
    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/templates/${template.id}/versions`,
      );
      setVersions(TemplateVersionsResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  return (
    <div className="stack compact-stack">
      <button className="text-link" onClick={() => void toggle()} type="button">
        {versions ? 'Hide version history' : 'Version history'}
      </button>
      {error ? <span className="alert alert-error">{error}</span> : null}
      {versions?.map((version) => (
        <div className="row-actions" key={version.id}>
          <span className="muted small">
            v{version.versionNumber}
            {version.id === template.latestVersionId ? ' · latest' : ''}
            {version.id === template.publishedVersionId ? ' · live' : ''}
          </span>
          <button
            className="button button-small"
            disabled={busy}
            onClick={() => onReview(template, version.versionNumber)}
            type="button"
          >
            Review
          </button>
          <button
            className="button button-small"
            disabled={busy}
            onClick={() => onUseForPage(template.id, version.id)}
            type="button"
          >
            Use
          </button>
          <button
            className="button button-small"
            disabled={busy || !canUpdate || version.id === template.latestVersionId}
            onClick={() => onRestore(template, version)}
            type="button"
          >
            Restore as draft
          </button>
          <button
            className="button button-small button-success"
            disabled={busy || !canPublish || version.id === template.publishedVersionId}
            onClick={() => onPublish(template, version.versionNumber)}
            type="button"
          >
            Publish v{version.versionNumber}
          </button>
        </div>
      ))}
    </div>
  );
}

function SubmissionsView({
  submissions,
  selected,
  page,
  search,
  status,
  onSearch,
  onStatusFilter,
  onSelect,
  onPrevious,
  onNext,
  onUpdateStatus,
}: {
  submissions: FormSubmission[];
  selected: FormSubmission | null;
  page: { limit: number; offset: number; total: number; hasNextPage: boolean };
  search: string;
  status: string;
  onSearch: (value: string) => void;
  onStatusFilter: (value: string) => void;
  onSelect: (submission: FormSubmission | null) => void;
  onPrevious: () => void;
  onNext: () => void;
  onUpdateStatus: (submission: FormSubmission, status: FormSubmission['status']) => void;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Submissions"
        description="Review form submissions captured by published pages."
      />
      <ResourceToolbar>
        <label className="inline-field">
          Search
          <input
            aria-label="Search submissions"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Name, email or phone"
            value={search}
          />
        </label>
        <label className="inline-field">
          Status
          <select
            aria-label="Filter submissions by status"
            onChange={(event) => onStatusFilter(event.target.value)}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </ResourceToolbar>
      <section className="panel">
        {submissions.length ? (
          <div className="list" aria-label="Submission list">
            {submissions.map((submission) => (
              <button
                className={
                  selected?.id === submission.id
                    ? 'list-row selectable selected submission-row'
                    : 'list-row selectable submission-row'
                }
                key={submission.id}
                onClick={() => onSelect(submission)}
                type="button"
              >
                <span>
                  <strong>
                    {submission.fields.find((field) => field.type === 'email')?.value ||
                      submission.fields[0]?.value ||
                      'Submission'}
                  </strong>
                  <span className="muted">
                    {submission.pageName} ·{' '}
                    {new Date(submission.submittedAt).toLocaleString()}
                  </span>
                </span>
                <StatusBadge status={submission.status} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No submissions yet"
            description="Publish a page with a form to start collecting leads."
          />
        )}
        <div className="form-actions">
          <button
            className="button button-ghost button-small"
            disabled={page.offset === 0}
            onClick={onPrevious}
            type="button"
          >
            Previous
          </button>
          <span className="muted small">
            {page.total === 0
              ? '0'
              : `${page.offset + 1}–${page.offset + submissions.length}`}{' '}
            of {page.total}
          </span>
          <button
            className="button button-ghost button-small"
            disabled={!page.hasNextPage}
            onClick={onNext}
            type="button"
          >
            Next
          </button>
        </div>
      </section>
      {selected ? (
        <Drawer
          description={`${selected.siteName} · ${selected.pageName}`}
          eyebrow="Submission detail"
          onClose={() => onSelect(null)}
          open
          title={selected.pageName}
        >
          <div className="detail-drawer-section">
            <span className="muted small">Status</span>
            <div className="detail-drawer-status-row">
              <StatusBadge status={selected.status} />
              <select
                aria-label="Submission status"
                onChange={(event) =>
                  onUpdateStatus(selected, event.target.value as FormSubmission['status'])
                }
                value={selected.status}
              >
                <option value="new">New</option>
                <option value="read">Read</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="detail-drawer-section">
            <span className="muted small">Source</span>
            <span>
              {selected.siteName} · {selected.pageName}
            </span>
            <span className="muted small">
              {selected.pagePath ?? (selected.pageSlug ? `/${selected.pageSlug}` : '/')} ·
              Submitted {new Date(selected.submittedAt).toLocaleString()} · published
              version {selected.pageVersionId.slice(0, 8)}
            </span>
          </div>
          <div className="detail-drawer-section">
            <strong>Submitted fields</strong>
            <div className="submission-detail-fields">
              {selected.fields.map((field) => (
                <div className="detail-field" key={field.fieldId}>
                  <span className="muted small">{field.label}</span>
                  <span>{String(field.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="muted">{description}</p>
    </div>
  );
}
function PanelTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {count === undefined ? null : <span className="pill">{count}</span>}
    </div>
  );
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
    </div>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : 'Something went wrong. Please try again.';
}
