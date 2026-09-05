import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page as PlaywrightPage,
} from '@playwright/test';
import { createDefaultSiteDesignSystem } from '@payload/contracts';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';

const canonical = {
  organizationName: process.env.E2E_CANONICAL_ORGANIZATION_NAME ?? 'E2E Development',
  organizationSlug: process.env.E2E_CANONICAL_ORGANIZATION_SLUG ?? 'e2e-development',
  workspaceName: process.env.E2E_CANONICAL_WORKSPACE_NAME ?? 'E2E Workspace',
  siteName: process.env.E2E_CANONICAL_SITE_NAME ?? 'E2E Builder Site',
  siteSlug: process.env.E2E_CANONICAL_SITE_SLUG ?? 'e2e-builder',
  pageName: process.env.E2E_CANONICAL_PAGE_NAME ?? 'E2E Home',
  pageSlug: process.env.E2E_CANONICAL_PAGE_SLUG ?? 'e2e-home',
} as const;

type Organization = { id: string; slug: string };
type Workspace = { id: string; name: string; organizationId: string };
type Site = { id: string; slug: string; name: string };
type Page = {
  id: string;
  name: string;
  path: string;
  slug?: string;
  versionNumber: number;
  payload: unknown;
  publishedVersionId?: string;
};

function isTemporaryIntegrationName(name: string): boolean {
  return name.startsWith('__e2e__') || /^(?:Sales email|CRM webhook) \d+$/.test(name);
}

export type CanonicalEnvironment = {
  organizationId: string;
  workspaceId: string;
  siteId: string;
  siteName: string;
  pageId: string;
  organizationSlug: string;
  siteSlug: string;
  pageSlug: string;
};

export const canonicalEnvironmentNames = {
  organizationName: canonical.organizationName,
  workspaceName: canonical.workspaceName,
  siteName: canonical.siteName,
  pageName: canonical.pageName,
} as const;

export type TemporaryPage = {
  id: string;
  name: string;
  slug: string;
  dispose: () => Promise<void>;
};

function baselinePayload(title = canonical.pageName) {
  return {
    version: 1 as const,
    metadata: { documentTitle: title },
    root: { id: 'root', type: 'root' as const, props: {}, children: [] },
  };
}

async function json<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(
      `API ${response.url()} failed with ${response.status()}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

async function ensureLogin(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${apiBase}/auth/login`, {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error(`Canonical E2E login failed with ${response.status()}`);
  }
}

async function switchContext(
  request: APIRequestContext,
  organizationId: string,
  workspaceId: string,
): Promise<void> {
  const response = await request.post(`${apiBase}/auth/context`, {
    data: { organizationId, workspaceId },
  });
  if (!response.ok()) {
    throw new Error(`Canonical E2E context switch failed with ${response.status()}`);
  }
}

async function ensureOrganization(request: APIRequestContext): Promise<Organization> {
  const list = await json<{ items: Organization[] }>(
    await request.get(`${apiBase}/organizations`),
  );
  const existing = list.items.find(
    (organization) => organization.slug === canonical.organizationSlug,
  );
  if (existing) return existing;
  return json<Organization>(
    await request.post(`${apiBase}/organizations`, {
      data: { name: canonical.organizationName, slug: canonical.organizationSlug },
    }),
  );
}

async function ensureWorkspace(
  request: APIRequestContext,
  organizationId: string,
): Promise<Workspace> {
  const list = await json<{ items: Workspace[] }>(
    await request.get(`${apiBase}/organizations/${organizationId}/workspaces`),
  );
  const existing = list.items.find(
    (workspace) => workspace.name === canonical.workspaceName,
  );
  if (existing) return existing;
  return json<Workspace>(
    await request.post(`${apiBase}/organizations/${organizationId}/workspaces`, {
      data: { name: canonical.workspaceName },
    }),
  );
}

async function ensureSite(
  request: APIRequestContext,
  workspaceId: string,
): Promise<Site> {
  const list = await json<{ items: Site[] }>(
    await request.get(`${apiBase}/workspaces/${workspaceId}/sites?limit=100&offset=0`),
  );
  const existing = list.items.find((site) => site.slug === canonical.siteSlug);
  if (existing) return existing;
  return json<Site>(
    await request.post(`${apiBase}/workspaces/${workspaceId}/sites`, {
      data: { name: canonical.siteName, slug: canonical.siteSlug },
    }),
  );
}

async function listPages(request: APIRequestContext, siteId: string): Promise<Page[]> {
  const list = await json<{ items: Page[] }>(
    await request.get(`${apiBase}/sites/${siteId}/pages?limit=100&offset=0`),
  );
  return list.items;
}

async function ensureBaselinePage(
  request: APIRequestContext,
  siteId: string,
): Promise<Page> {
  const pages = await listPages(request, siteId);
  const existing =
    pages.find((page) => page.path === '/') ??
    pages.find((page) => page.slug === canonical.pageSlug);
  if (!existing) {
    return json<Page>(
      await request.post(`${apiBase}/sites/${siteId}/pages`, {
        data: {
          name: canonical.pageName,
          path: '/',
          slug: canonical.pageSlug,
          payload: baselinePayload(),
        },
      }),
    );
  }

  const duplicateCanonicalPage = pages.find(
    (page) => page.slug === canonical.pageSlug && page.id !== existing.id,
  );
  if (duplicateCanonicalPage) {
    const response = await request.delete(
      `${apiBase}/pages/${duplicateCanonicalPage.id}`,
    );
    if (!response.ok() && response.status() !== 404) {
      throw new Error(
        `Could not remove duplicate canonical page ${duplicateCanonicalPage.id}: ${response.status()}`,
      );
    }
  }

  if (
    existing.name !== canonical.pageName ||
    existing.path !== '/' ||
    existing.slug !== canonical.pageSlug ||
    JSON.stringify(existing.payload) !== JSON.stringify(baselinePayload())
  ) {
    return json<Page>(
      await request.patch(`${apiBase}/pages/${existing.id}`, {
        data: {
          name: canonical.pageName,
          path: '/',
          slug: canonical.pageSlug,
          payload: baselinePayload(),
          expectedVersionNumber: existing.versionNumber,
        },
      }),
    );
  }
  return existing;
}

export async function resetCanonicalEnvironment(
  request: APIRequestContext,
  environment: CanonicalEnvironment,
): Promise<void> {
  await switchContext(request, environment.organizationId, environment.workspaceId);
  const pages = await listPages(request, environment.siteId);
  for (const page of pages) {
    if (page.id === environment.pageId || !page.name.startsWith('__e2e__')) continue;
    const response = await request.delete(`${apiBase}/pages/${page.id}`);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`Could not clean temporary page ${page.id}: ${response.status()}`);
    }
  }

  const baseline = pages.find((page) => page.id === environment.pageId);
  if (
    baseline &&
    JSON.stringify(baseline.payload) !== JSON.stringify(baselinePayload())
  ) {
    await json<Page>(
      await request.patch(`${apiBase}/pages/${baseline.id}`, {
        data: {
          name: canonical.pageName,
          path: '/',
          slug: canonical.pageSlug,
          payload: baselinePayload(),
          expectedVersionNumber: baseline.versionNumber,
        },
      }),
    );
  }
  if (baseline?.publishedVersionId) {
    const response = await request.post(`${apiBase}/pages/${baseline.id}/unpublish`);
    if (!response.ok() && response.status() !== 404) {
      throw new Error(
        `Could not unpublish canonical page ${baseline.id}: ${response.status()}`,
      );
    }
  }

  // Header/Footer are independent layout resources. Reset the canonical page
  // to the no-layout baseline and remove only E2E-owned resources; explicit
  // user layouts are never touched by a test fixture.
  await json(
    await request.patch(`${apiBase}/pages/${environment.pageId}/layout`, {
      data: { attachments: [] },
    }),
  );
  for (const kind of ['headers', 'footers'] as const) {
    const response = await json<{ items: Array<{ id: string; name: string }> }>(
      await request.get(`${apiBase}/sites/${environment.siteId}/layouts/${kind}`),
    );
    for (const resource of response.items) {
      if (!resource.name.startsWith('__e2e__')) continue;
      const deleted = await request.delete(
        `${apiBase}/sites/${environment.siteId}/layouts/${kind}/${resource.id}`,
      );
      if (!deleted.ok() && deleted.status() !== 404) {
        throw new Error(
          `Could not remove temporary ${kind} resource ${resource.id}: ${deleted.status()}`,
        );
      }
    }
  }

  const templates = await json<{ items: Array<{ id: string; name: string }> }>(
    await request.get(
      `${apiBase}/workspaces/${environment.workspaceId}/templates?limit=100&offset=0`,
    ),
  );
  for (const template of templates.items) {
    if (!template.name.startsWith('__e2e__')) continue;
    const deleted = await request.delete(
      `${apiBase}/workspaces/${environment.workspaceId}/templates/${template.id}`,
    );
    if (!deleted.ok() && deleted.status() !== 404) {
      throw new Error(
        `Could not remove temporary template ${template.id}: ${deleted.status()}`,
      );
    }
  }

  const designSystem = await json<{ draft: unknown }>(
    await request.get(
      `${apiBase}/workspaces/${environment.workspaceId}/sites/${environment.siteId}/design-system`,
    ),
  );
  const defaultDesignSystem = createDefaultSiteDesignSystem();
  if (JSON.stringify(designSystem.draft) !== JSON.stringify(defaultDesignSystem)) {
    await json(
      await request.patch(
        `${apiBase}/workspaces/${environment.workspaceId}/sites/${environment.siteId}/design-system`,
        { data: defaultDesignSystem },
      ),
    );
  }

  const reusables = await json<{ items: Array<{ id: string; name: string }> }>(
    await request.get(
      `${apiBase}/workspaces/${environment.workspaceId}/sites/${environment.siteId}/reusables?limit=100&offset=0`,
    ),
  );
  for (const reusable of reusables.items) {
    if (!reusable.name.startsWith('__e2e__')) continue;
    const response = await request.delete(
      `${apiBase}/workspaces/${environment.workspaceId}/sites/${environment.siteId}/reusables/${reusable.id}`,
    );
    if (!response.ok() && response.status() !== 404) {
      throw new Error(
        `Could not archive temporary reusable ${reusable.id}: ${response.status()}`,
      );
    }
  }

  const integrations = await json<{
    items: Array<{ id: string; name: string }>;
  }>(
    await request.get(
      `${apiBase}/workspaces/${environment.workspaceId}/integrations?limit=100`,
    ),
  );
  const temporaryIntegrationIds = new Set(
    integrations.items
      .filter((integration) => isTemporaryIntegrationName(integration.name))
      .map((integration) => integration.id),
  );
  if (temporaryIntegrationIds.size > 0) {
    for (const page of pages) {
      const response = await request.get(`${apiBase}/pages/${page.id}/form-integrations`);
      if (response.status() === 404) continue;
      const bindings = await json<{
        items: Array<{ formNodeId: string; integrationIds: string[] }>;
      }>(response);
      for (const binding of bindings.items) {
        const remaining = binding.integrationIds.filter(
          (integrationId) => !temporaryIntegrationIds.has(integrationId),
        );
        if (remaining.length === binding.integrationIds.length) continue;
        await json(
          await request.patch(
            `${apiBase}/pages/${page.id}/form-integrations/${binding.formNodeId}`,
            { data: { integrationIds: remaining } },
          ),
        );
      }
    }
  }
  for (const integration of integrations.items) {
    if (!isTemporaryIntegrationName(integration.name)) continue;
    const response = await request.delete(
      `${apiBase}/workspaces/${environment.workspaceId}/integrations/${integration.id}`,
    );
    if (!response.ok() && response.status() !== 404) {
      throw new Error(
        `Could not remove temporary integration ${integration.id}: ${response.status()}`,
      );
    }
  }

  const domains = await json<{
    items: Array<{ id: string; hostname: string }>;
  }>(await request.get(`${apiBase}/workspaces/${environment.workspaceId}/domains`));
  for (const domain of domains.items) {
    if (domain.hostname !== 'e2e-seo.example.com') continue;
    const response = await request.delete(
      `${apiBase}/workspaces/${environment.workspaceId}/domains/${domain.id}`,
    );
    if (!response.ok() && response.status() !== 404) {
      throw new Error(
        `Could not remove temporary domain ${domain.id}: ${response.status()}`,
      );
    }
  }
}

export async function ensureCanonicalEnvironment(
  request: APIRequestContext,
): Promise<CanonicalEnvironment> {
  await ensureLogin(request);
  const organization = await ensureOrganization(request);
  const workspace = await ensureWorkspace(request, organization.id);
  await switchContext(request, organization.id, workspace.id);
  const site = await ensureSite(request, workspace.id);
  const page = await ensureBaselinePage(request, site.id);
  const environment: CanonicalEnvironment = {
    organizationId: organization.id,
    workspaceId: workspace.id,
    siteId: site.id,
    siteName: site.name,
    pageId: page.id,
    organizationSlug: canonical.organizationSlug,
    siteSlug: canonical.siteSlug,
    pageSlug: canonical.pageSlug,
  };
  await resetCanonicalEnvironment(request, environment);
  return environment;
}

export async function createTemporaryPage(
  request: APIRequestContext,
  environment: CanonicalEnvironment,
  testSlug: string,
  payload = baselinePayload(`__e2e__ ${testSlug}`),
): Promise<TemporaryPage> {
  await switchContext(request, environment.organizationId, environment.workspaceId);
  const normalizedSlug = testSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const page = await json<Page>(
    await request.post(`${apiBase}/sites/${environment.siteId}/pages`, {
      data: {
        name: `__e2e__ ${testSlug}`,
        slug: `e2e-${normalizedSlug}`,
        payload,
      },
    }),
  );
  return {
    id: page.id,
    name: page.name,
    slug: page.slug ?? normalizedSlug,
    async dispose() {
      const response = await request.delete(`${apiBase}/pages/${page.id}`);
      if (!response.ok() && response.status() !== 404) {
        throw new Error(
          `Could not clean temporary page ${page.id}: ${response.status()}`,
        );
      }
    },
  };
}

export async function loginToCanonicalBuilder(page: import('@playwright/test').Page) {
  await page.goto('/');
  if (new URL(page.url()).pathname === '/login') {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page).toHaveURL(/\/workspaces\/[^/]+$/);
}

export async function switchCanonicalBrowserContext(
  page: PlaywrightPage,
  environment: CanonicalEnvironment,
): Promise<void> {
  const response = await page.request.post(`${apiBase}/auth/context`, {
    data: {
      organizationId: environment.organizationId,
      workspaceId: environment.workspaceId,
    },
  });
  if (!response.ok()) {
    throw new Error(`Canonical browser context switch failed with ${response.status()}`);
  }
  await page.reload();
}

export async function openCanonicalBuilder(
  page: import('@playwright/test').Page,
  request: APIRequestContext,
  environment: CanonicalEnvironment,
  testSlug: string,
  payload?: unknown,
): Promise<
  TemporaryPage & Pick<CanonicalEnvironment, 'workspaceId' | 'siteId' | 'siteSlug'>
> {
  const temporaryPage = await createTemporaryPage(
    request,
    environment,
    testSlug,
    payload,
  );
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, environment);
  await page.goto(
    `/workspaces/${environment.workspaceId}/sites/${environment.siteId}/pages/${temporaryPage.id}/builder`,
  );
  // The builder owns the GrapesJS instance behind this stable host. GrapesJS
  // briefly keeps the host collapsed while it mounts its iframe, so waiting
  // for attachment plus the frame is more reliable than a visibility check on
  // the internal editor root.
  const editorHost = page.locator('.builder-editor-host');
  await expect(editorHost).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
    timeout: 15_000,
  });
  return {
    ...temporaryPage,
    siteId: environment.siteId,
    siteSlug: environment.siteSlug,
    workspaceId: environment.workspaceId,
  };
}

export const test = base.extend<{ canonicalEnvironment: CanonicalEnvironment }>({
  canonicalEnvironment: async ({ request }, use) => {
    const environment = await ensureCanonicalEnvironment(request);
    try {
      await use(environment);
    } finally {
      await resetCanonicalEnvironment(request, environment);
    }
  },
});

export { expect };
