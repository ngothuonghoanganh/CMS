const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';
const canonicalOrganizationSlug =
  process.env.E2E_CANONICAL_ORGANIZATION_SLUG ?? 'e2e-development';
const canonicalWorkspaceName =
  process.env.E2E_CANONICAL_WORKSPACE_NAME ?? 'E2E Workspace';
const canonicalSiteSlug = process.env.E2E_CANONICAL_SITE_SLUG ?? 'e2e-builder';
const dryRun = !process.argv.includes('--apply');

const cookieJar = new Map();

function setCookies(headers) {
  const values =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  for (const value of values) {
    const [pair] = value.split(';', 1);
    const separator = pair.indexOf('=');
    if (separator > 0) {
      cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
}

async function request(path, options = {}, { allowNotFound = false } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookieJar.size > 0
        ? { cookie: [...cookieJar].map(([key, value]) => `${key}=${value}`).join('; ') }
        : {}),
      ...(options.headers ?? {}),
    },
  });
  setCookies(response.headers);
  if (allowNotFound && response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed with ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

function isLegacyE2EOrganization(organization) {
  return (
    organization.name.startsWith('Organization A ') ||
    organization.name.startsWith('Organization B ') ||
    organization.name.startsWith('Extension Tenant B ') ||
    organization.name.startsWith('Extension Contract ') ||
    organization.name.startsWith('Countdown Tenant ') ||
    organization.name.startsWith('Billing Tenant ') ||
    organization.slug.startsWith('organization-a-') ||
    organization.slug.startsWith('organization-b-') ||
    organization.slug.startsWith('extension-tenant-b-') ||
    organization.slug.startsWith('extension-contract-') ||
    organization.slug.startsWith('countdown-tenant-') ||
    organization.slug.startsWith('billing-')
  );
}

function isTemporaryIntegrationName(name) {
  return name.startsWith('__e2e__') || /^(Sales email|CRM webhook) \d+$/.test(name);
}

async function main() {
  console.log(`Test data cleanup (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
  await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const organizationsResponse = await request('/organizations');
  const organizations = organizationsResponse?.items ?? [];
  const legacyOrganizations = organizations.filter(isLegacyE2EOrganization);
  console.log(
    `Tenants to remove: ${legacyOrganizations.length} legacy E2E tenant(s) detected`,
  );
  for (const organization of legacyOrganizations) {
    console.log(
      `  - ${organization.name} (${organization.id}) [review only: no delete API]`,
    );
  }

  const canonicalOrganization = organizations.find(
    (organization) => organization.slug === canonicalOrganizationSlug,
  );
  if (!canonicalOrganization) {
    console.log(
      `PRESERVED: canonical tenant is not present (${canonicalOrganizationSlug})`,
    );
    console.log('Sites to remove: 0');
    console.log('Pages to remove: 0');
    console.log('Public routes to remove: 0');
    console.log('No data was changed.');
    return;
  }

  const workspacesResponse = await request(
    `/organizations/${canonicalOrganization.id}/workspaces`,
  );
  const workspace = (workspacesResponse?.items ?? []).find(
    (candidate) => candidate.name === canonicalWorkspaceName,
  );
  if (!workspace) {
    console.log(
      `PRESERVED: canonical workspace is not present (${canonicalWorkspaceName})`,
    );
    console.log('Sites to remove: 0');
    console.log('Pages to remove: 0');
    console.log('Public routes to remove: 0');
    console.log('No data was changed.');
    return;
  }

  await request('/auth/context', {
    method: 'POST',
    body: JSON.stringify({
      organizationId: canonicalOrganization.id,
      workspaceId: workspace.id,
    }),
  });
  const sitesResponse = await request(
    `/workspaces/${workspace.id}/sites?limit=100&offset=0`,
  );
  const site = (sitesResponse?.items ?? []).find(
    (candidate) => candidate.slug === canonicalSiteSlug,
  );
  if (!site) {
    console.log(`PRESERVED: canonical site is not present (${canonicalSiteSlug})`);
    console.log('Pages to remove: 0');
    console.log('Public routes to remove: 0');
    console.log('No data was changed.');
    return;
  }

  const pagesResponse = await request(`/sites/${site.id}/pages?limit=100&offset=0`);
  const temporaryPages = (pagesResponse?.items ?? []).filter((page) =>
    page.name.startsWith('__e2e__'),
  );
  console.log(
    `PRESERVED: ${canonicalOrganization.name} / ${workspace.name} / ${site.name}`,
  );
  console.log(`Sites to remove: 0 (site deletion is intentionally unsupported)`);
  console.log(`Pages to remove: ${temporaryPages.length}`);
  for (const page of temporaryPages) {
    if (dryRun) {
      console.log(`  - ${page.name} (${page.id})`);
      continue;
    }
    await request(`/pages/${page.id}`, { method: 'DELETE' });
    console.log(`  - deleted ${page.name} (${page.id})`);
  }
  const integrationsResponse = await request(
    `/workspaces/${workspace.id}/integrations?limit=100`,
  );
  const temporaryIntegrations = (integrationsResponse?.items ?? []).filter(
    (integration) => isTemporaryIntegrationName(integration.name),
  );
  const temporaryIntegrationIds = new Set(
    temporaryIntegrations.map((integration) => integration.id),
  );
  if (temporaryIntegrationIds.size > 0) {
    const pagesForBindings = await request(`/sites/${site.id}/pages?limit=100&offset=0`);
    for (const page of pagesForBindings?.items ?? []) {
      const bindings = await request(
        `/pages/${page.id}/form-integrations`,
        {},
        { allowNotFound: true },
      );
      for (const binding of bindings?.items ?? []) {
        const remaining = binding.integrationIds.filter(
          (integrationId) => !temporaryIntegrationIds.has(integrationId),
        );
        if (remaining.length === binding.integrationIds.length) continue;
        if (dryRun) {
          console.log(
            `  - would detach ${remaining.length === 0 ? 'all' : 'temporary'} integration(s) from ${page.name}/${binding.formNodeId}`,
          );
        } else {
          await request(`/pages/${page.id}/form-integrations/${binding.formNodeId}`, {
            method: 'PATCH',
            body: JSON.stringify({ integrationIds: remaining }),
          });
        }
      }
    }
  }
  console.log(`Integrations to remove: ${temporaryIntegrations.length}`);
  for (const integration of temporaryIntegrations) {
    if (dryRun) {
      console.log(`  - ${integration.name} (${integration.id})`);
      continue;
    }
    await request(`/workspaces/${workspace.id}/integrations/${integration.id}`, {
      method: 'DELETE',
    });
    console.log(`  - deleted ${integration.name} (${integration.id})`);
  }
  console.log('Public routes to remove: 0 (no public route deletion was requested)');
  console.log(dryRun ? 'Dry run complete. No data was changed.' : 'Apply complete.');
  if (legacyOrganizations.length > 0) {
    console.log(
      'Legacy tenants were not deleted because the API exposes no safe organization/site teardown endpoint.',
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('fetch failed')) {
    console.error(`Cleanup API is unavailable at ${apiBase}. Start the API and retry.`);
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
