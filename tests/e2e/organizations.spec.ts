import { expect, test } from '@playwright/test';

const email = process.env.AUTH_EMAIL ?? 'admin@example.com';
const password = process.env.AUTH_PASSWORD ?? 'change-me-in-development';
const apiBase = 'http://127.0.0.1:3001/api/v1';

test('creates organizations and keeps workspace resources isolated after context switching', async ({
  request,
}) => {
  const suffix = Date.now().toString();
  const login = await request.post(`${apiBase}/auth/login`, {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();

  const organizationAResponse = await request.post(`${apiBase}/organizations`, {
    data: { name: `Organization A ${suffix}`, slug: `organization-a-${suffix}` },
  });
  expect(organizationAResponse.status()).toBe(201);
  const organizationA = (await organizationAResponse.json()) as { id: string };
  const workspaceAResponse = await request.post(
    `${apiBase}/organizations/${organizationA.id}/workspaces`,
    { data: { name: `Workspace A ${suffix}` } },
  );
  expect(workspaceAResponse.status()).toBe(201);
  const workspaceA = (await workspaceAResponse.json()) as { id: string };

  const contextAResponse = await request.post(`${apiBase}/auth/context`, {
    headers: { 'x-request-id': `context-a-${suffix}` },
    data: { organizationId: organizationA.id, workspaceId: workspaceA.id },
  });
  expect(contextAResponse.status()).toBe(200);
  const siteResponse = await request.post(
    `${apiBase}/workspaces/${workspaceA.id}/sites`,
    {
      data: { name: `Site A ${suffix}`, slug: `site-a-${suffix}` },
    },
  );
  expect(siteResponse.status()).toBe(201);
  const siteA = (await siteResponse.json()) as { id: string };
  const pageResponse = await request.post(`${apiBase}/sites/${siteA.id}/pages`, {
    data: {
      name: `Page A ${suffix}`,
      slug: `page-a-${suffix}`,
      payload: {
        version: 1,
        metadata: { documentTitle: `Page A ${suffix}` },
        root: { id: 'root', type: 'root', props: {}, children: [] },
      },
    },
  });
  expect(pageResponse.status()).toBe(201);
  const pageA = (await pageResponse.json()) as { id: string };

  const organizationBResponse = await request.post(`${apiBase}/organizations`, {
    data: { name: `Organization B ${suffix}`, slug: `organization-b-${suffix}` },
  });
  expect(organizationBResponse.status()).toBe(201);
  const organizationB = (await organizationBResponse.json()) as { id: string };
  const workspaceBResponse = await request.post(
    `${apiBase}/organizations/${organizationB.id}/workspaces`,
    { data: { name: `Workspace B ${suffix}` } },
  );
  expect(workspaceBResponse.status()).toBe(201);
  const workspaceB = (await workspaceBResponse.json()) as { id: string };

  const contextBResponse = await request.post(`${apiBase}/auth/context`, {
    data: { organizationId: organizationB.id, workspaceId: workspaceB.id },
  });
  expect(contextBResponse.status()).toBe(200);
  expect((await request.get(`${apiBase}/sites/${siteA.id}/pages`)).status()).toBe(404);
  expect((await request.get(`${apiBase}/pages/${pageA.id}`)).status()).toBe(404);
  expect(
    (await request.get(`${apiBase}/organizations/${organizationA.id}`)).status(),
  ).toBe(200);
  expect(
    (
      await request.get(
        `${apiBase}/organizations/${'00000000-0000-4000-8000-000000000000'}`,
      )
    ).status(),
  ).toBe(404);

  const contextAAgainResponse = await request.post(`${apiBase}/auth/context`, {
    data: { organizationId: organizationA.id, workspaceId: workspaceA.id },
  });
  expect(contextAAgainResponse.status()).toBe(200);
  expect((await request.get(`${apiBase}/pages/${pageA.id}`)).status()).toBe(200);
});
