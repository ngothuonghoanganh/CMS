'use client';

import {
  AssetListResponseSchema,
  AuthSessionResponseSchema,
  OrganizationListResponseSchema,
  OrganizationMembershipListResponseSchema,
  WorkspaceListResponseSchema,
  CustomDomainListResponseSchema,
  FormIntegrationBindingListResponseSchema,
  IntegrationListResponseSchema,
  SubmissionListResponseSchema,
  PageListResponseSchema,
  PageSeoSettingsSchema,
  PageVersionListResponseSchema,
  SiteListResponseSchema,
  TemplateListResponseSchema,
  type Asset,
  type AuthSessionResponse,
  type Organization,
  type OrganizationMembership,
  type Workspace,
  type CustomDomain,
  type FormSubmission,
  type FormIntegrationBinding,
  type FormNode,
  type Integration,
  type PageNodeV2,
  type LandingPage,
  type PageVersion,
  type PageSeoSettings,
  type Site,
  type Template,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { ApiClientError, api } from './lib/api';
import { IntegrationsView } from './integrations-view';
import { AnalyticsView } from './analytics-view';
import { DomainsView } from './domains-view';
import { SeoView } from './seo-view';
import { BillingView } from './billing-view';

type View =
  | 'dashboard'
  | 'sites'
  | 'pages'
  | 'assets'
  | 'templates'
  | 'submissions'
  | 'integrations'
  | 'analytics'
  | 'domains'
  | 'seo'
  | 'billing'
  | 'organization';
type SiteForm = { name: string; slug: string };
type PageForm = { name: string; slug: string };
type AssetForm = { filename: string; mimeType: string; size: string; storageKey: string };
type TemplateForm = { name: string; description: string };
type DomainForm = { hostname: string; landingPageId: string; isPrimary: boolean };

const blankSite: SiteForm = { name: '', slug: '' };
const blankPage: PageForm = { name: '', slug: '' };
const blankAsset: AssetForm = {
  filename: '',
  mimeType: 'image/png',
  size: '0',
  storageKey: '/assets/',
};
const blankTemplate: TemplateForm = { name: '', description: '' };
const blankDomain: DomainForm = { hostname: '', landingPageId: '', isPrimary: false };
const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

function defaultPayload(title: string) {
  return {
    metadata: { documentTitle: title },
    root: { children: [], id: 'root', props: {}, type: 'root' as const },
    version: 1 as const,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function CmsDashboard() {
  const router = useRouter();
  const [view, setView] = useState<View>('dashboard');
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
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
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
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
  const [assetForm, setAssetForm] = useState<AssetForm>(blankAsset);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(blankTemplate);
  const [domainForm, setDomainForm] = useState<DomainForm>(blankDomain);
  const [editingSiteId, setEditingSiteId] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pagesRequestId = useRef(0);

  const selectedPage = pages.find((page) => page.id === selectedPageId);
  const counts = useMemo(
    () => ({
      assets: assets.length,
      pages: pages.length,
      sites: sites.length,
      templates: templates.length,
    }),
    [assets.length, pages.length, sites.length, templates.length],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

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
    if ((view === 'domains' || view === 'seo') && selectedSiteId) {
      void refreshPages(selectedSiteId);
    }
  }, [selectedSiteId, view]);

  useEffect(() => {
    if (selectedPageId) {
      void refreshVersions(selectedPageId);
      void refreshFormBindings(selectedPageId);
      void refreshSeo(selectedPageId);
    } else {
      setVersions([]);
      setFormBindings([]);
      setSeoSettings(null);
    }
  }, [selectedPageId]);

  useEffect(() => {
    if (view === 'submissions' && session) {
      void refreshSubmissions(0);
    }
  }, [session, submissionSearch, submissionStatus, view]);

  async function bootstrap() {
    setLoading(true);
    try {
      const currentSession = AuthSessionResponseSchema.parse(await api.get('/auth/me'));
      setSession(currentSession);
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
      const workspaceId = currentSession.workspace.id;
      const [siteResponse, assetResponse, templateResponse, domainResponse] =
        await Promise.all([
          api.get(`/workspaces/${workspaceId}/sites?limit=100`),
          api.get(`/workspaces/${workspaceId}/assets?limit=100`),
          api.get(`/workspaces/${workspaceId}/templates?limit=100`),
          api.get(`/workspaces/${workspaceId}/domains`),
        ]);
      const nextSites = SiteListResponseSchema.parse(siteResponse).items;
      setSites(nextSites);
      setAssets(AssetListResponseSchema.parse(assetResponse).items);
      setTemplates(TemplateListResponseSchema.parse(templateResponse).items);
      setDomains(CustomDomainListResponseSchema.parse(domainResponse).items);
      const integrationResponse = await api.get(
        `/workspaces/${workspaceId}/integrations?limit=100`,
      );
      setIntegrations(IntegrationListResponseSchema.parse(integrationResponse).items);
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

  async function refreshOrganizationManagement(organizationId: string) {
    try {
      const [workspaceResponse, memberResponse] = await Promise.all([
        api.get(`/organizations/${organizationId}/workspaces`),
        api.get(`/organizations/${organizationId}/members`),
      ]);
      setWorkspaces(WorkspaceListResponseSchema.parse(workspaceResponse).items);
      setOrganizationMembers(
        OrganizationMembershipListResponseSchema.parse(memberResponse).items,
      );
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
      setPages([]);
      setAssets([]);
      setTemplates([]);
      setSubmissions([]);
      setIntegrations([]);
      setDomains([]);
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

  async function refreshVersions(pageId: string) {
    try {
      const response = await api.get(`/pages/${pageId}/versions?limit=100`);
      setVersions(PageVersionListResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshSubmissions(offset: number) {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (submissionSearch.trim()) params.set('search', submissionSearch.trim());
      if (submissionStatus) params.set('status', submissionStatus);
      const response = await api.get(`/submissions?${params.toString()}`);
      const parsed = SubmissionListResponseSchema.parse(response);
      setSubmissions(parsed.items);
      setSubmissionPage(parsed.pagination);
      setSelectedSubmission((current) =>
        current && parsed.items.some((item) => item.id === current.id) ? current : null,
      );
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshFormBindings(pageId: string) {
    try {
      const response = await api.get(`/pages/${pageId}/form-integrations`);
      setFormBindings(FormIntegrationBindingListResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    }
  }

  async function refreshSeo(pageId: string) {
    try {
      const response = await api.get(`/pages/${pageId}/seo`);
      setSeoSettings(PageSeoSettingsSchema.parse(response));
    } catch (caughtError) {
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

  async function publishPage(page: LandingPage) {
    await runBusy(async () => {
      const updated = await api.post<LandingPage>(`/pages/${page.id}/publish`, {});
      setPages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (page.id === selectedPageId) {
        await refreshVersions(page.id);
      }
      setNotice('Landing page published.');
    });
  }

  async function unpublishPage(page: LandingPage) {
    await runBusy(async () => {
      const updated = await api.post<LandingPage>(`/pages/${page.id}/unpublish`);
      setPages((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (page.id === selectedPageId) {
        await refreshVersions(page.id);
      }
      setNotice('Landing page unpublished.');
    });
  }

  function previewPage(page: LandingPage) {
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
          slug: siteForm.slug || slugify(siteForm.name),
        });
        setSites((current) => [created, ...current]);
        setSelectedSiteId(created.id);
        setNotice('Site created.');
      }
      setEditingSiteId('');
      setSiteForm(blankSite);
    });
  }

  async function handlePageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedSiteId) return;
    await runBusy(async () => {
      if (selectedPageId) {
        const updated = await api.patch<LandingPage>(`/pages/${selectedPageId}`, {
          expectedVersionNumber: versions[0]?.versionNumber,
          name: pageForm.name,
          slug: pageForm.slug || null,
        });
        setPages((current) =>
          current.map((page) => (page.id === updated.id ? updated : page)),
        );
        setNotice('Landing page metadata updated.');
      } else {
        const created = await api.post<LandingPage>(`/sites/${selectedSiteId}/pages`, {
          name: pageForm.name,
          ...(pageForm.slug ? { slug: pageForm.slug } : {}),
          payload: defaultPayload(pageForm.name),
        });
        pagesRequestId.current += 1;
        setPages((current) => [created, ...current]);
        setSelectedPageId(created.id);
        setNotice('Landing page and draft version 1 created.');
      }
      setPageForm(blankPage);
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

  async function handleDomainSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await runBusy(async () => {
      const created = await api.post<CustomDomain>(
        `/workspaces/${session.workspace.id}/domains`,
        {
          hostname: domainForm.hostname,
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
        Loading CMS…
      </main>
    );
  if (!session) return <main className="loading-page">Redirecting to sign in…</main>;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">PL</div>
          <div className="brand-copy">
            <strong>Payload CMS</strong>
            <span>Landing page platform</span>
          </div>
        </div>
        <nav aria-label="Primary navigation" className="nav-list">
          {(
            [
              ['dashboard', 'Dashboard'],
              ['organization', 'Organization'],
              ['sites', 'Sites'],
              ['pages', 'Landing Pages'],
              ['assets', 'Assets'],
              ['templates', 'Templates'],
              ['submissions', 'Submissions'],
              ['integrations', 'Integrations'],
              ['analytics', 'Analytics'],
              ['domains', 'Domains'],
              ['seo', 'SEO'],
              ['billing', 'Billing & Usage'],
            ] as const
          ).map(([key, label]) => (
            <button
              className={view === key ? 'nav-item active' : 'nav-item'}
              key={key}
              onClick={() => setView(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="muted small">{session.user.email}</span>
          <button
            className="button button-ghost"
            onClick={() => void handleLogout()}
            type="button"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="content-area">
        <header className="topbar">
          <div>
            <span className="muted small">Organization</span>
            <select
              aria-label="Current organization"
              onChange={(event) => {
                const organizationId = event.target.value;
                void api
                  .get(`/organizations/${organizationId}/workspaces`)
                  .then((response) => {
                    const next = WorkspaceListResponseSchema.parse(response).items;
                    setWorkspaces(next);
                    if (next[0]) void switchContext(organizationId, next[0].id);
                  })
                  .catch((caughtError) => setError(toErrorMessage(caughtError)));
              }}
              value={session.workspace.organizationId}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                  {organization.status === 'suspended' ? ' (suspended)' : ''}
                </option>
              ))}
            </select>
            <span className="muted small">Workspace</span>
            <select
              aria-label="Current workspace"
              onChange={(event) =>
                void switchContext(session.workspace.organizationId, event.target.value)
              }
              value={session.workspace.id}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
          <span className="status-dot">Authenticated</span>
        </header>
        <section className="content-inner">
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="alert alert-success" role="status">
              {notice}
            </div>
          ) : null}
          {view === 'organization' ? (
            <OrganizationView
              busy={busy}
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
              busy={busy}
              editingSiteId={editingSiteId}
              form={siteForm}
              onCancel={() => {
                setEditingSiteId('');
                setSiteForm(blankSite);
              }}
              onChange={setSiteForm}
              onEdit={(site) => {
                setEditingSiteId(site.id);
                setSiteForm({ name: site.name, slug: site.slug });
              }}
              onSubmit={handleSiteSubmit}
              sites={sites}
            />
          ) : null}
          {view === 'pages' ? (
            <PagesView
              busy={busy}
              form={pageForm}
              onChange={setPageForm}
              onOpenBuilder={(page) =>
                router.push(
                  `/workspaces/${session.workspace.id}/sites/${page.siteId}/pages/${page.id}/builder`,
                )
              }
              onPreview={previewPage}
              onPublish={(page) => void publishPage(page)}
              onSelectPage={(page) => {
                setSelectedPageId(page.id);
                setPageForm({ name: page.name, slug: page.slug ?? '' });
              }}
              onSelectSite={setSelectedSiteId}
              onSubmit={handlePageSubmit}
              onUnpublish={(page) => void unpublishPage(page)}
              pages={pages}
              selectedPage={selectedPage}
              selectedSiteId={selectedSiteId}
              sites={sites}
              versions={versions}
              bindings={formBindings}
              bindingSaving={bindingSaving}
              integrations={integrations}
              onSaveFormBinding={(formNodeId, integrationIds) =>
                void saveFormBinding(formNodeId, integrationIds)
              }
            />
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
              onSubmit={handleTemplateSubmit}
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
            />
          ) : null}
          {view === 'seo' ? (
            <SeoView
              busy={busy}
              onSave={handleSeoSubmit}
              onSelectPage={(pageId) => {
                setSelectedPageId(pageId);
                const page = pages.find((candidate) => candidate.id === pageId);
                if (page) setPageForm({ name: page.name, slug: page.slug ?? '' });
              }}
              pages={pages}
              selectedPageId={selectedPageId}
              settings={seoSettings}
            />
          ) : null}
          {view === 'billing' ? <BillingView workspaceId={session.workspace.id} /> : null}
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
        </section>
        <section className="panel">
          <PanelTitle title="Workspaces" count={workspaces.length} />
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
        {members.length ? (
          <div className="list">
            {members.map((member) => (
              <div className="list-row" key={member.id}>
                <div>
                  <strong>{member.userId}</strong>
                  <span className="muted">{member.role}</span>
                </div>
                <div className="row-actions">
                  {member.role !== 'owner' ? (
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
                  <button
                    className="button button-small button-danger"
                    onClick={() => onRemoveMember(member)}
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
        description="A focused workspace for managing your landing page inventory."
      />
      <div className="metric-grid">
        {(
          [
            ['sites', 'Sites', counts.sites],
            ['pages', 'Landing pages', counts.pages],
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
            : 'Create your first site to start organizing landing pages.'}
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
  form,
  busy,
  editingSiteId,
  onChange,
  onSubmit,
  onEdit,
  onCancel,
}: {
  sites: Site[];
  form: SiteForm;
  busy: boolean;
  editingSiteId: string;
  onChange: (form: SiteForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (site: Site) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Workspace"
        title="Sites"
        description="Create and maintain the destinations that own your landing pages."
      />
      <div className="two-column">
        <section className="panel">
          <PanelTitle title={editingSiteId ? 'Edit site' : 'Create a site'} />
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Site name
              <input
                aria-label="Site name"
                name="name"
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label>
              Slug
              <input
                aria-label="Slug"
                name="slug"
                onChange={(event) => onChange({ ...form, slug: event.target.value })}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                placeholder="my-site"
                required
                value={form.slug}
              />
            </label>
            <div className="form-actions">
              <button className="button button-primary" disabled={busy} type="submit">
                {busy ? 'Saving…' : editingSiteId ? 'Save changes' : 'Create site'}
              </button>
              {editingSiteId ? (
                <button className="button button-ghost" onClick={onCancel} type="button">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
        <section className="panel">
          <PanelTitle title="Your sites" count={sites.length} />
          {sites.length ? (
            <div className="list">
              {sites.map((site) => (
                <div className="list-row" key={site.id}>
                  <div>
                    <strong>{site.name}</strong>
                    <span className="muted">/{site.slug}</span>
                  </div>
                  <button
                    className="button button-small"
                    onClick={() => onEdit(site)}
                    type="button"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No sites found"
              description="Your site list will appear here."
            />
          )}
        </section>
      </div>
    </>
  );
}

function PagesView({
  sites,
  pages,
  selectedSiteId,
  selectedPage,
  versions,
  bindings,
  bindingSaving,
  integrations,
  onSaveFormBinding,
  form,
  busy,
  onOpenBuilder,
  onPreview,
  onPublish,
  onSelectSite,
  onSelectPage,
  onChange,
  onSubmit,
  onUnpublish,
}: {
  sites: Site[];
  pages: LandingPage[];
  selectedSiteId: string;
  selectedPage: LandingPage | undefined;
  versions: PageVersion[];
  bindings: FormIntegrationBinding[];
  bindingSaving: boolean;
  integrations: Integration[];
  form: PageForm;
  busy: boolean;
  onOpenBuilder: (page: LandingPage) => void;
  onPreview: (page: LandingPage) => void;
  onPublish: (page: LandingPage) => void;
  onSelectSite: (siteId: string) => void;
  onSelectPage: (page: LandingPage) => void;
  onChange: (form: PageForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUnpublish: (page: LandingPage) => void;
  onSaveFormBinding: (formNodeId: string, integrationIds: string[]) => void;
}) {
  const draftVersion = selectedPage
    ? versions.find((version) => version.id === selectedPage.currentDraftVersionId)
    : undefined;
  const formNodes =
    draftVersion?.payload.version === 2 ? findFormNodes(draftVersion.payload.root) : [];
  return (
    <>
      <PageHeading
        eyebrow="Content"
        title="Landing pages"
        description="Manage page identity and draft history without opening the visual builder."
      />
      <div className="toolbar">
        <label className="inline-field">
          Site
          <select
            aria-label="Site"
            onChange={(event) => onSelectSite(event.target.value)}
            value={selectedSiteId}
          >
            <option value="">Select a site</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="two-column">
        <section className="panel">
          <PanelTitle
            title={selectedPage ? 'Edit page metadata' : 'Create a landing page'}
          />
          {!selectedSiteId ? (
            <EmptyState
              title="Select a site first"
              description="Landing pages belong to a site."
            />
          ) : (
            <form className="stack" onSubmit={onSubmit}>
              <label>
                Page name
                <input
                  aria-label="Page name"
                  onChange={(event) => onChange({ ...form, name: event.target.value })}
                  required
                  value={form.name}
                />
              </label>
              <label>
                Slug <span className="muted">(optional)</span>
                <input
                  aria-label="Slug"
                  onChange={(event) => onChange({ ...form, slug: event.target.value })}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={form.slug}
                />
              </label>
              <button className="button button-primary" disabled={busy} type="submit">
                {busy ? 'Saving…' : selectedPage ? 'Save metadata' : 'Create page'}
              </button>
            </form>
          )}
        </section>
        <section className="panel">
          <PanelTitle title="Page inventory" count={pages.length} />
          {pages.length ? (
            <div className="list">
              {pages.map((page) => (
                <div
                  className={
                    selectedPage?.id === page.id
                      ? 'list-row selectable selected'
                      : 'list-row selectable'
                  }
                  key={page.id}
                >
                  <button
                    className="page-select-button"
                    onClick={() => onSelectPage(page)}
                    type="button"
                  >
                    <div>
                      <strong>{page.name}</strong>
                      <span className="muted">/{page.slug ?? 'no-slug'}</span>
                    </div>
                    <span className="pill">{publicationStatus(page)}</span>
                  </button>
                  <button
                    className="button button-secondary button-small"
                    onClick={() => onOpenBuilder(page)}
                    type="button"
                  >
                    Open Builder
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No landing pages"
              description="Create a page to see its draft and metadata here."
            />
          )}
        </section>
      </div>
      {selectedPage ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Immutable snapshots</span>
              <h2>Version history</h2>
            </div>
            <div className="row-actions">
              <span className="pill">{publicationStatus(selectedPage)}</span>
              <button
                className="button button-secondary button-small"
                onClick={() => onPreview(selectedPage)}
                type="button"
              >
                Preview draft
              </button>
              {publicationStatus(selectedPage) === 'Published' ? (
                <button
                  className="button button-ghost button-small"
                  disabled={busy}
                  onClick={() => onUnpublish(selectedPage)}
                  type="button"
                >
                  Unpublish
                </button>
              ) : (
                <button
                  className="button button-primary button-small"
                  disabled={busy}
                  onClick={() => onPublish(selectedPage)}
                  type="button"
                >
                  Publish draft
                </button>
              )}
            </div>
          </div>
          <p className="muted small">
            Current draft v
            {versions.find((version) => version.id === selectedPage.currentDraftVersionId)
              ?.versionNumber ?? '—'}
            {selectedPage.publishedVersionId &&
            selectedPage.publishedVersionId !== selectedPage.currentDraftVersionId
              ? ' · Public site still uses the published snapshot.'
              : ''}
          </p>
          {versions.length ? (
            <div className="list">
              {versions.map((version) => (
                <div className="list-row" key={version.id}>
                  <div>
                    <strong>Version {version.versionNumber}</strong>
                    <span className="muted">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="muted">Snapshot</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No versions found"
              description="The page has no readable draft history."
            />
          )}
        </section>
      ) : null}
      {selectedPage ? (
        <section className="panel" aria-label="Form integration settings">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Notifications</span>
              <h2>Form integrations</h2>
            </div>
            {bindingSaving ? <span className="muted small">Saving…</span> : null}
          </div>
          {formNodes.length ? (
            <div className="stack">
              {formNodes.map((formNode) => {
                const selectedIds =
                  bindings.find((binding) => binding.formNodeId === formNode.id)
                    ?.integrationIds ?? [];
                return (
                  <div className="form-integration-card" key={formNode.id}>
                    <strong>Form {formNode.id}</strong>
                    {integrations.length ? (
                      <div className="stack compact-stack">
                        {integrations.map((integration) => (
                          <label className="checkbox-field" key={integration.id}>
                            <input
                              checked={selectedIds.includes(integration.id)}
                              disabled={bindingSaving}
                              onChange={(event) => {
                                const nextIds = event.target.checked
                                  ? [...selectedIds, integration.id]
                                  : selectedIds.filter((id) => id !== integration.id);
                                onSaveFormBinding(formNode.id, nextIds);
                              }}
                              type="checkbox"
                            />
                            <span>
                              {integration.name}{' '}
                              <span className="muted small">
                                ({integration.type} ·{' '}
                                {integration.enabled ? 'enabled' : 'disabled'})
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span className="muted small">
                        Create an integration from the Integrations section first.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No form in the current draft"
              description="Add a Form block in the visual builder to configure notifications."
            />
          )}
        </section>
      ) : null}
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
  editingTemplateId,
  onChange,
  onSubmit,
  onEdit,
  onRemove,
  onCancel,
}: {
  templates: Template[];
  form: TemplateForm;
  busy: boolean;
  editingTemplateId: string;
  onChange: (form: TemplateForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (template: Template) => void;
  onRemove: (templateId: string) => void;
  onCancel: () => void;
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
              <button className="button button-primary" disabled={busy} type="submit">
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
                  </div>
                  <div className="row-actions">
                    <button
                      className="button button-small"
                      onClick={() => onEdit(template)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="button button-small button-danger"
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
  onSelect: (submission: FormSubmission) => void;
  onPrevious: () => void;
  onNext: () => void;
  onUpdateStatus: (submission: FormSubmission, status: FormSubmission['status']) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Leads"
        title="Submissions"
        description="Review form submissions captured by published landing pages."
      />
      <section className="panel">
        <div className="toolbar">
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
        </div>
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
                <span className="pill">{submission.status}</span>
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
        <section className="panel" aria-label="Submission detail">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Submission detail</span>
              <h2>{selected.pageName}</h2>
            </div>
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
          <p className="muted small">
            {selected.siteName} · submitted{' '}
            {new Date(selected.submittedAt).toLocaleString()} · published version{' '}
            {selected.pageVersionId.slice(0, 8)}
          </p>
          <div className="submission-detail-fields">
            {selected.fields.map((field) => (
              <div className="list-row" key={field.fieldId}>
                <strong>{field.label}</strong>
                <span>{String(field.value)}</span>
              </div>
            ))}
          </div>
        </section>
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

function findFormNodes(node: PageNodeV2): FormNode[] {
  if (node.type === 'form') return [node];
  return node.children.flatMap((child) => findFormNodes(child));
}
function toErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : 'Something went wrong. Please try again.';
}

function publicationStatus(
  page: LandingPage,
): 'Published' | 'Newer draft' | 'Unpublished' {
  if (!page.publishedVersionId) {
    return 'Unpublished';
  }
  return page.publishedVersionId === page.currentDraftVersionId
    ? 'Published'
    : 'Newer draft';
}
