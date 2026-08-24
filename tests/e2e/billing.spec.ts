import { expect, request, test } from '@playwright/test';

test('provisions a default plan and enforces a tenant-scoped workspace quota', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const api = await request.newContext({
    baseURL: 'http://127.0.0.1:3001',
  });
  const suffix = Date.now().toString();
  const tenantSlug = `billing-${suffix}`;
  const ownerEmail = `billing-${suffix}@example.com`;
  const ownerPassword = 'billing-test-password';

  try {
    const adminLogin = await api.post('/api/v1/auth/login', {
      data: {
        email: process.env.AUTH_EMAIL ?? 'admin@example.com',
        password: process.env.AUTH_PASSWORD ?? 'change-me-in-development',
        tenantSlug: process.env.AUTH_TENANT_SLUG ?? 'demo',
      },
    });
    expect(adminLogin.ok()).toBe(true);

    const createdTenant = await api.post('/api/v1/control-plane/tenants', {
      data: {
        name: `Billing Tenant ${suffix}`,
        slug: tenantSlug,
        ownerEmail,
        ownerPassword,
        workspaceName: 'Billing Workspace',
      },
    });
    expect(createdTenant.ok()).toBe(true);
    const tenant = await createdTenant.json();

    const ownerLogin = await api.post('/api/v1/auth/login', {
      data: { email: ownerEmail, password: ownerPassword, tenantSlug },
    });
    expect(ownerLogin.ok()).toBe(true);
    const session = await ownerLogin.json();

    await page.goto('/login');
    await page.getByLabel('Email').fill(ownerEmail);
    await page.getByLabel('Tenant slug').fill(tenantSlug);
    await page.getByLabel('Password').fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();
    await page.getByRole('button', { name: 'Billing & Usage' }).click();
    await expect(page.getByRole('heading', { name: 'Billing & usage' })).toBeVisible();
    await expect(page.getByText('Free', { exact: true })).toBeVisible();

    const billingResponse = await api.get('/api/v1/billing');
    expect(billingResponse.ok()).toBe(true);
    const billing = await billingResponse.json();
    expect(billing.plan.key).toBe('free');
    expect(billing.subscription.tenantId).toBe(tenant.id);

    for (const name of ['Second workspace', 'Third workspace']) {
      const created = await api.post(`/api/v1/organizations/${tenant.id}/workspaces`, {
        data: { name },
      });
      expect(created.ok()).toBe(true);
    }

    const rejected = await api.post(`/api/v1/organizations/${tenant.id}/workspaces`, {
      data: { name: 'Blocked workspace' },
    });
    expect(rejected.status()).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({
      error: {
        code: 'QUOTA_EXCEEDED',
        details: { metric: 'workspaces', limit: 3, usage: 3 },
      },
    });

    const workspaceId = session.workspace.id as string;
    const siteResponse = await api.post(`/api/v1/workspaces/${workspaceId}/sites`, {
      data: { name: `Quota site ${suffix}`, slug: `quota-site-${suffix}` },
    });
    expect(siteResponse.ok()).toBe(true);
    const site = await siteResponse.json();
    const payload = {
      version: 1,
      metadata: { documentTitle: 'Quota test page' },
      root: { id: 'root', type: 'root', props: {}, children: [] },
    };
    for (let index = 0; index < 10; index += 1) {
      const createdPage = await api.post(`/api/v1/sites/${site.id}/pages`, {
        data: {
          name: `Quota page ${index}`,
          slug: `quota-page-${index}`,
          payload,
        },
      });
      expect(createdPage.ok()).toBe(true);
    }
    const rejectedPage = await api.post(`/api/v1/sites/${site.id}/pages`, {
      data: { name: 'Blocked page', slug: 'blocked-page', payload },
    });
    expect(rejectedPage.status()).toBe(409);
    await expect(rejectedPage.json()).resolves.toMatchObject({
      error: {
        code: 'QUOTA_EXCEEDED',
        details: { metric: 'landing_pages', limit: 10, usage: 10 },
      },
    });

    const firstDomain = await api.post(`/api/v1/workspaces/${workspaceId}/domains`, {
      data: { hostname: `first-${suffix}.example.com` },
    });
    expect(firstDomain.ok()).toBe(true);
    const rejectedDomain = await api.post(`/api/v1/workspaces/${workspaceId}/domains`, {
      data: { hostname: `second-${suffix}.example.com` },
    });
    expect(rejectedDomain.status()).toBe(409);
    await expect(rejectedDomain.json()).resolves.toMatchObject({
      error: {
        code: 'QUOTA_EXCEEDED',
        details: { metric: 'custom_domains', limit: 1, usage: 1 },
      },
    });

    for (let index = 0; index < 3; index += 1) {
      const createdIntegration = await api.post(
        `/api/v1/workspaces/${workspaceId}/integrations`,
        {
          data: {
            type: 'email',
            name: `Quota integration ${index}`,
            config: {
              recipients: [`billing-${index}@example.com`],
              subjectTemplate: 'Quota test',
            },
          },
        },
      );
      expect(createdIntegration.ok()).toBe(true);
    }
    const rejectedIntegration = await api.post(
      `/api/v1/workspaces/${workspaceId}/integrations`,
      {
        data: {
          type: 'email',
          name: 'Blocked integration',
          config: {
            recipients: ['blocked@example.com'],
            subjectTemplate: 'Quota test',
          },
        },
      },
    );
    expect(rejectedIntegration.status()).toBe(409);
    await expect(rejectedIntegration.json()).resolves.toMatchObject({
      error: {
        code: 'QUOTA_EXCEEDED',
        details: { metric: 'integrations', limit: 3, usage: 3 },
      },
    });

    expect(session.user.tenantId).toBe(tenant.id);
  } finally {
    await api.dispose();
  }
});
