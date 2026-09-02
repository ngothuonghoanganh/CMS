import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';
import {
  createTemporaryPage,
  loginToCanonicalBuilder,
  switchCanonicalBrowserContext,
  test,
} from './fixtures/canonical-environment';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';
const rendererBaseUrl =
  process.env.NEXT_PUBLIC_RENDERER_BASE_URL ?? 'http://127.0.0.1:3002';

type BuilderNode = {
  id: string;
  type: string;
  children: BuilderNode[];
};

async function responseJson<T>(
  response: import('@playwright/test').APIResponse,
): Promise<T> {
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

test('layout resources publish independently and render only when explicitly attached', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'layout-extension',
  );
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  const name = `__e2e__ Header ${Date.now()}`;
  const created = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
      {
        data: { kind: 'header', name },
      },
    ),
  );

  await responseJson(
    await request.patch(`${apiBaseUrl}/pages/${temporaryPage.id}/layout`, {
      data: {
        attachments: [
          {
            id: randomUUID(),
            type: 'header',
            resourceId: created.id,
            slot: 'page.header.top',
            enabled: true,
          },
        ],
      },
    }),
  );

  await page.goto(
    `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/layouts/headers/${created.id}/builder`,
  );
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeVisible({
    timeout: 15_000,
  });
  for (const tab of ['Layouts', 'Elements', 'Saved', 'Templates']) {
    await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Site Brand add', exact: true }).click();
  const document = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(document).toBeTruthy();
  const root = (document as { root: BuilderNode }).root;
  expect(root.children).toHaveLength(1);
  expect(root.children[0]?.type).toBe('global-header');
  expect(root.children[0]?.children.map((child) => child.type)).toEqual(['site-brand']);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Publish Header', exact: true }).click();
  await expect(page.getByText('Live · Up to date', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await responseJson(
    await request.post(`${apiBaseUrl}/pages/${temporaryPage.id}/publish`, { data: {} }),
  );
  await page.goto(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  await expect(page.locator('[data-site-global="header"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-payload-node-type="site-brand"]')).toContainText(
    /E2E Builder Site/,
  );
});

test('footer layout builder exposes blocks and publishes to an attached page', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'footer-layout-extension',
  );
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  const name = `__e2e__ Footer ${Date.now()}`;
  const created = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/footers`,
      {
        data: { kind: 'footer', name },
      },
    ),
  );

  await responseJson(
    await request.patch(`${apiBaseUrl}/pages/${temporaryPage.id}/layout`, {
      data: {
        attachments: [
          {
            id: randomUUID(),
            type: 'footer',
            resourceId: created.id,
            slot: 'page.footer.bottom',
            enabled: true,
          },
        ],
      },
    }),
  );

  await page.goto(
    `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/layouts/footers/${created.id}/builder`,
  );
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Site Brand add', exact: true }).click();
  const document = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(document).toBeTruthy();
  const root = (document as { root: BuilderNode }).root;
  expect(root.children).toHaveLength(1);
  expect(root.children[0]?.type).toBe('global-footer');
  expect(root.children[0]?.children.map((child) => child.type)).toEqual(['site-brand']);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Publish Footer', exact: true }).click();
  await expect(page.getByText('Live · Up to date', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await responseJson(
    await request.post(`${apiBaseUrl}/pages/${temporaryPage.id}/publish`, { data: {} }),
  );
  await page.goto(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  await expect(page.locator('[data-site-global="footer"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-payload-node-type="site-brand"]')).toContainText(
    /E2E Builder Site/,
  );
});

test('applying a template clones its attachment configuration and payload', async ({
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(60_000);
  const header = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
      {
        data: { kind: 'header', name: `__e2e__ Template header ${Date.now()}` },
      },
    ),
  );
  const initialPayload = {
    version: 1,
    metadata: { documentTitle: 'Template source' },
    root: { id: 'root', type: 'root', props: {}, children: [] },
  };
  const template = await responseJson<{
    id: string;
    latestVersionId: string;
  }>(
    await request.post(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/templates`,
      {
        data: {
          name: `__e2e__ Template ${Date.now()}`,
          payload: initialPayload,
          layoutAttachments: [
            {
              id: randomUUID(),
              type: 'header',
              resourceId: header.id,
              slot: 'page.header.top',
              enabled: true,
            },
          ],
        },
      },
    ),
  );
  const applied = await responseJson<{
    id: string;
    appliedTemplate?: { templateId: string; templateVersionId: string };
    layoutAttachments: Array<{ resourceId: string; type: string }>;
  }>(
    await request.post(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/templates/${template.id}/apply`,
      {
        data: {
          siteId: canonicalEnvironment.siteId,
          name: '__e2e__ Applied template',
          path: '/e2e-applied-template',
        },
      },
    ),
  );
  expect(applied.appliedTemplate).toMatchObject({
    templateId: template.id,
    templateVersionId: template.latestVersionId,
  });
  expect(applied.layoutAttachments).toEqual([
    expect.objectContaining({ resourceId: header.id, type: 'header' }),
  ]);

  await responseJson(
    await request.patch(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/templates/${template.id}`,
      {
        data: {
          payload: {
            ...initialPayload,
            metadata: { documentTitle: 'Changed after apply' },
          },
        },
      },
    ),
  );
  const versions = await responseJson<{
    items: Array<{ payload: { metadata: { documentTitle: string } } }>;
  }>(await request.get(`${apiBaseUrl}/pages/${applied.id}/versions?limit=10`));
  expect(versions.items[0]?.payload.metadata.documentTitle).toBe('Template source');
});
