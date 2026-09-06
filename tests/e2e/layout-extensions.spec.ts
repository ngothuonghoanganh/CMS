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

function nodeId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function headerDocument(buttonLabel: string) {
  return {
    version: 1,
    documentKind: 'site-header',
    metadata: { documentTitle: buttonLabel },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: nodeId('global-header'),
          type: 'global-header',
          props: { position: 'static' },
          children: [
            {
              id: nodeId('header-button'),
              type: 'button',
              props: { label: buttonLabel, href: '/', target: '_self' },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function footerDocument(text: string) {
  return {
    version: 1,
    documentKind: 'site-footer',
    metadata: { documentTitle: text },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: nodeId('global-footer'),
          type: 'global-footer',
          props: {},
          children: [
            {
              id: nodeId('footer-text'),
              type: 'text',
              props: { text },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function legacyNavigationProps() {
  return {
    source: 'main',
    orientation: 'horizontal',
    mobileBehavior: 'collapse',
    alignment: 'left',
    ariaLabel: 'Main navigation',
  };
}

function globalNavigationDocument(kind: 'site-header' | 'site-footer') {
  const globalType = kind === 'site-header' ? 'global-header' : 'global-footer';
  return {
    version: 1,
    documentKind: kind,
    metadata: { documentTitle: kind },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: nodeId(globalType),
          type: globalType,
          props: kind === 'site-header' ? { position: 'static' } : {},
          children: [
            {
              id: nodeId('navigation'),
              type: 'navigation-view',
              props: legacyNavigationProps(),
              children: [],
            },
          ],
        },
      ],
    },
  };
}

async function responseJson<T>(
  response: import('@playwright/test').APIResponse,
): Promise<T> {
  if (!response.ok()) {
    throw new Error(
      `API ${response.url()} failed with ${response.status()}: ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

test('workspace layout library is available without a site scope', async ({
  request,
  canonicalEnvironment,
}) => {
  const name = `__e2e__ Workspace header ${Date.now()}`;
  const created = await responseJson<{ id: string; siteId?: string }>(
    await request.post(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/layouts/headers`,
      { data: { kind: 'header', name } },
    ),
  );

  try {
    expect(created.siteId).toBeUndefined();

    const workspaceLayouts = await responseJson<{
      items: Array<{ id: string; name: string }>;
    }>(
      await request.get(
        `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/layouts/headers`,
      ),
    );
    expect(
      workspaceLayouts.items.some((item) => item.id === created.id && item.name === name),
    ).toBe(true);

    const siteLayouts = await responseJson<{ items: Array<{ id: string }> }>(
      await request.get(
        `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
      ),
    );
    expect(siteLayouts.items.map((item) => item.id)).toContain(created.id);
  } finally {
    const deleted = await request.delete(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/layouts/headers/${created.id}`,
    );
    expect([204, 404]).toContain(deleted.status());
  }
});

test('Extensions exposes the workspace layout library without selecting a site', async ({
  page,
  canonicalEnvironment,
}) => {
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  await page.goto(`/workspaces/${canonicalEnvironment.workspaceId}/extensions`);

  const layoutSection = page.getByRole('region', {
    name: 'Header and footer extensions',
  });
  await expect(layoutSection).toBeVisible();
  await expect(layoutSection).toContainText('Layout extensions');
  await expect(layoutSection).not.toContainText('Select a site');
});

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
  await expect(
    page.getByRole('button', { name: 'Global Header add', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Global Header add', exact: true }).click();
  await page
    .getByRole('button', { name: 'Remove selected element', exact: true })
    .click();
  await page.getByRole('button', { name: 'Global Header add', exact: true }).click();
  const resetHeader = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(
    (resetHeader as { root: BuilderNode }).root.children.map((child) => child.type),
  ).toEqual(['global-header']);
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
    canonicalEnvironment.siteName,
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
  await expect(
    page.getByRole('button', { name: 'Global Footer add', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Global Footer add', exact: true }).click();
  await page
    .getByRole('button', { name: 'Remove selected element', exact: true })
    .click();
  await page.getByRole('button', { name: 'Global Footer add', exact: true }).click();
  const resetFooter = await page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload();
  });
  expect(
    (resetFooter as { root: BuilderNode }).root.children.map((child) => child.type),
  ).toEqual(['global-footer']);
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
    canonicalEnvironment.siteName,
  );
});

test('header and footer menus can be removed and added again in the inspector', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const layouts = await Promise.all(
    (
      [
        ['headers', 'header', 'site-header'],
        ['footers', 'footer', 'site-footer'],
      ] as const
    ).map(async ([pathKind, resourceKind, documentKind]) => ({
      pathKind,
      id: (
        await responseJson<{ id: string }>(
          await request.post(
            `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/${pathKind}`,
            {
              data: {
                kind: resourceKind,
                name: `__e2e__ Menu reset ${resourceKind} ${Date.now()}`,
                document: globalNavigationDocument(documentKind),
              },
            },
          ),
        )
      ).id,
    })),
  );

  try {
    await loginToCanonicalBuilder(page);
    await switchCanonicalBrowserContext(page, canonicalEnvironment);
    for (const layout of layouts) {
      await page.goto(
        `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/layouts/${layout.pathKind}/${layout.id}/builder`,
      );
      await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: 'Layers', exact: true }).click();
      await page
        .getByRole('treeitem', { name: 'Select Navigation', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Remove selected element', exact: true })
        .click();
      await expect(
        page.getByRole('treeitem', { name: 'Select Navigation', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
      await page.getByRole('tab', { name: 'Elements', exact: true }).click();
      await page
        .getByRole('button', { name: 'Navigation View add', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Navigation View add', exact: true })
        .click();
      await page.getByRole('button', { name: 'Layers', exact: true }).click();
      await expect(
        page.getByRole('treeitem', { name: 'Select Navigation', exact: true }),
      ).toHaveCount(2);
      await page
        .getByRole('treeitem', { name: 'Select Navigation', exact: true })
        .last()
        .click();
      await expect(page.getByText('Menu items', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '+ Add item', exact: true }).click();
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(
        page.getByText('Add items to own this menu in the Builder.', { exact: false }),
      ).toBeVisible();
      await page.getByRole('button', { name: '+ Add item', exact: true }).click();

      const payload = await page.evaluate(() => {
        const debug = (
          window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
        ).__payloadBuilderDebug;
        return debug?.getPayload();
      });
      const navigations = (
        payload as {
          root: {
            children: Array<{ children: Array<{ type: string; props: unknown }> }>;
          };
        }
      ).root.children[0]?.children.filter((child) => child.type === 'navigation-view');
      expect(navigations).toHaveLength(2);
      expect(
        navigations.some((navigation) =>
          (navigation.props as { items?: Array<{ label: string }> }).items?.some(
            (item) => item.label === 'New item',
          ),
        ),
      ).toBe(true);
    }
  } finally {
    await Promise.all(
      layouts.map(async (layout) => {
        const deleted = await request.delete(
          `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/layouts/${layout.pathKind}/${layout.id}`,
        );
        expect([204, 404]).toContain(deleted.status());
      }),
    );
  }
});

test('navbar property fields accept edits and persist after save and reload', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const layout = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
      {
        data: {
          kind: 'header',
          name: `__e2e__ Navbar properties ${Date.now()}`,
          document: globalNavigationDocument('site-header'),
        },
      },
    ),
  );
  let sectionPageId: string | undefined;

  try {
    const sectionPage = await responseJson<{ id: string }>(
      await request.post(`${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/pages`, {
        data: {
          name: `__e2e__ Navbar section ${Date.now()}`,
          slug: `e2e-navbar-section-${Date.now()}`,
          anchors: ['details'],
          payload: {
            version: 1,
            metadata: { documentTitle: 'Navbar section' },
            root: { id: 'root', type: 'root', props: {}, children: [] },
          },
        },
      }),
    );
    sectionPageId = sectionPage.id;
    await loginToCanonicalBuilder(page);
    await switchCanonicalBrowserContext(page, canonicalEnvironment);
    await page.goto(
      `/workspaces/${canonicalEnvironment.workspaceId}/layouts/headers/${layout.id}/builder`,
    );
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Preview site', { exact: true })).toHaveValue(
      canonicalEnvironment.siteId,
    );
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByRole('treeitem', { name: 'Select Navigation', exact: true }).click();
    await page.getByLabel('Navigation source', { exact: true }).selectOption('footer');
    await page.getByLabel('Orientation', { exact: true }).selectOption('vertical');
    await page.getByLabel('Mobile behavior', { exact: true }).selectOption('stack');
    await page.getByLabel('Alignment', { exact: true }).selectOption('center');
    await page.getByLabel('Accessible label', { exact: true }).fill('Footer navigation');
    await page.getByRole('button', { name: '+ Add item', exact: true }).click();

    await page.getByLabel('Label', { exact: true }).first().fill('Home');
    await expect(
      page
        .frameLocator('iframe.gjs-frame')
        .locator('[data-payload-navigation-preview="true"] a')
        .first(),
    ).toHaveText('Home');
    const homeUrl = page.getByLabel('URL', { exact: true }).first();
    await homeUrl.fill('not-a-url');
    await expect(homeUrl).toHaveAttribute('aria-invalid', 'true');
    await homeUrl.fill('https://example.com/home');
    await expect(homeUrl).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Open in', { exact: true }).first().selectOption('_blank');

    await page.getByRole('button', { name: '+ Add item', exact: true }).click();
    await page.getByLabel('Label', { exact: true }).nth(1).fill('Contact');
    await page.getByLabel('Target type').nth(1).selectOption('action');
    await page.getByLabel('Action', { exact: true }).first().selectOption('email');
    const contactValue = page.getByLabel('Value', { exact: true }).first();
    await contactValue.fill('not-an-email');
    await expect(contactValue).toHaveAttribute('aria-invalid', 'true');
    await contactValue.fill('contact@example.com');
    await expect(contactValue).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Open in', { exact: true }).nth(1).selectOption('_blank');
    await page.getByRole('button', { name: '+ Add item', exact: true }).click();
    await page.getByLabel('Label', { exact: true }).nth(2).fill('Home page');
    await page.getByLabel('Target type').nth(2).selectOption('page');
    await page
      .getByLabel('Page', { exact: true })
      .first()
      .selectOption(canonicalEnvironment.pageId);
    await page.getByLabel('Target type').nth(2).selectOption('section');
    await page.getByLabel('Page', { exact: true }).first().selectOption(sectionPageId);
    await expect(page.getByLabel('Section', { exact: true }).first()).toBeEnabled();
    await page.getByLabel('Section', { exact: true }).first().selectOption('details');
    await page.getByLabel('Open in', { exact: true }).nth(2).selectOption('_blank');
    await page.getByRole('button', { name: 'Add child to Home', exact: true }).click();

    await expect(page.getByLabel('Label', { exact: true })).toHaveCount(4);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByRole('treeitem', { name: 'Select Navigation', exact: true }).click();
    await expect(page.getByLabel('Navigation source', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Orientation', { exact: true })).toHaveValue('vertical');
    await expect(page.getByLabel('Mobile behavior', { exact: true })).toHaveValue(
      'stack',
    );
    await expect(page.getByLabel('Alignment', { exact: true })).toHaveValue('center');
    await expect(page.getByLabel('Accessible label', { exact: true })).toHaveValue(
      'Footer navigation',
    );
    const homeItem = page.getByRole('treeitem', { name: /Drag Home Label Home/ });
    const contactItem = page.getByRole('treeitem', {
      name: /Drag Contact Label Contact/,
    });
    const pageItem = page.getByRole('treeitem', {
      name: /Drag Home page Label Home page/,
    });
    await expect(homeItem.getByLabel('Label', { exact: true })).toHaveValue('Home');
    await expect(homeItem.getByLabel('URL', { exact: true })).toHaveValue(
      'https://example.com/home',
    );
    await expect(homeItem.getByLabel('Open in', { exact: true })).toHaveValue('_blank');
    await expect(contactItem.getByLabel('Label', { exact: true })).toHaveValue('Contact');
    await expect(contactItem.getByLabel('Action', { exact: true })).toHaveValue('email');
    await expect(contactItem.getByLabel('Value', { exact: true })).toHaveValue(
      'contact@example.com',
    );
    await expect(contactItem.getByLabel('Open in', { exact: true })).toHaveValue(
      '_blank',
    );
    await expect(pageItem.getByLabel('Target type', { exact: true })).toHaveValue(
      'section',
    );
    await expect(pageItem.getByLabel('Page', { exact: true })).toHaveValue(sectionPageId);
    await expect(pageItem.getByLabel('Section', { exact: true })).toHaveValue('details');
    await expect(pageItem.getByLabel('Open in', { exact: true })).toHaveValue('_blank');
  } finally {
    if (sectionPageId) {
      const deletedPage = await request.delete(`${apiBaseUrl}/pages/${sectionPageId}`);
      expect([204, 404]).toContain(deletedPage.status());
    }
    const deleted = await request.delete(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/layouts/headers/${layout.id}`,
    );
    expect([204, 404]).toContain(deleted.status());
  }
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
          siteId: canonicalEnvironment.siteId,
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

test('Template Builder saves an immutable draft and publishes the latest version', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const name = `__e2e__ Visual template ${Date.now()}`;
  const template = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/templates`,
      {
        data: {
          name,
          siteId: canonicalEnvironment.siteId,
          payload: {
            version: 1,
            metadata: { documentTitle: 'Visual template' },
            root: { id: 'root', type: 'root', props: {}, children: [] },
          },
        },
      },
    ),
  );
  await loginToCanonicalBuilder(page);
  await switchCanonicalBrowserContext(page, canonicalEnvironment);
  await page.goto(
    `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/templates/${template.id}/builder`,
  );
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('tab', { name: 'Elements', exact: true }).click();
  await page.getByRole('button', { name: 'Text add', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Saved template draft.', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Publish Template', exact: true }).click();
  await expect(
    page.getByText('Template published. New pages can use this version.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15_000 });
  const versions = await responseJson<{
    items: Array<{ versionNumber: number }>;
  }>(
    await request.get(
      `${apiBaseUrl}/workspaces/${canonicalEnvironment.workspaceId}/templates/${template.id}/versions`,
    ),
  );
  expect(versions.items.map((version) => version.versionNumber)).toEqual([2, 1]);
});

test('saved layout drafts are visible in preview while public stays published', async ({
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(60_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'layout-review-parity',
  );
  const headerName = `__e2e__ Review header ${Date.now()}`;
  const footerName = `__e2e__ Review footer ${Date.now()}`;
  const header = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
      {
        data: { kind: 'header', name: headerName, document: headerDocument('Header v1') },
      },
    ),
  );
  const footer = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/footers`,
      {
        data: { kind: 'footer', name: footerName, document: footerDocument('Footer v1') },
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
            resourceId: header.id,
            slot: 'page.header.top',
            enabled: true,
          },
          {
            id: randomUUID(),
            type: 'footer',
            resourceId: footer.id,
            slot: 'page.footer.bottom',
            enabled: true,
          },
        ],
      },
    }),
  );
  await responseJson(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers/${header.id}/publish`,
      { data: {} },
    ),
  );
  await responseJson(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/footers/${footer.id}/publish`,
      { data: {} },
    ),
  );
  await responseJson(
    await request.post(`${apiBaseUrl}/pages/${temporaryPage.id}/publish`, { data: {} }),
  );

  const publicBefore = await request.get(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  expect(publicBefore.ok()).toBe(true);
  const publicBeforeMarkup = await publicBefore.text();
  expect(publicBeforeMarkup).toContain('Header v1');
  expect(publicBeforeMarkup).toContain('Footer v1');

  await responseJson(
    await request.patch(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers/${header.id}`,
      { data: { document: headerDocument('Header v2') } },
    ),
  );
  await responseJson(
    await request.patch(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/footers/${footer.id}`,
      { data: { document: footerDocument('Footer v2') } },
    ),
  );
  const preview = await responseJson<{
    layout?: { header?: { document: unknown }; footer?: { document: unknown } };
  }>(await request.get(`${apiBaseUrl}/preview/pages/${temporaryPage.id}`));
  expect(JSON.stringify(preview.layout?.header?.document)).toContain('Header v2');
  expect(JSON.stringify(preview.layout?.footer?.document)).toContain('Footer v2');

  const publicDuringDraft = await request.get(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  const publicDuringDraftMarkup = await publicDuringDraft.text();
  expect(publicDuringDraftMarkup).toContain('Header v1');
  expect(publicDuringDraftMarkup).toContain('Footer v1');
  expect(publicDuringDraftMarkup).not.toContain('Header v2');
  expect(publicDuringDraftMarkup).not.toContain('Footer v2');

  await responseJson(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers/${header.id}/publish`,
      { data: {} },
    ),
  );
  await responseJson(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/footers/${footer.id}/publish`,
      { data: {} },
    ),
  );
  const publicAfter = await request.get(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  const publicAfterMarkup = await publicAfter.text();
  expect(publicAfterMarkup).toContain('Header v2');
  expect(publicAfterMarkup).toContain('Footer v2');
});

test('pages have no implicit layout and preserve attachment placement', async ({
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(60_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'layout-placement',
  );
  await responseJson(
    await request.post(`${apiBaseUrl}/pages/${temporaryPage.id}/publish`, { data: {} }),
  );
  const noLayout = await request.get(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  expect((await noLayout.text()).match(/data-site-global=/g) ?? []).toHaveLength(0);

  const header = await responseJson<{ id: string }>(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
      { data: { kind: 'header', name: `__e2e__ Placement header ${Date.now()}` } },
    ),
  );
  await responseJson(
    await request.post(
      `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers/${header.id}/publish`,
      { data: {} },
    ),
  );
  await responseJson(
    await request.patch(`${apiBaseUrl}/pages/${temporaryPage.id}/layout`, {
      data: {
        attachments: [
          {
            id: randomUUID(),
            type: 'header',
            resourceId: header.id,
            slot: 'page.header.top-right',
            enabled: true,
          },
        ],
      },
    }),
  );
  await responseJson(
    await request.post(`${apiBaseUrl}/pages/${temporaryPage.id}/publish`, { data: {} }),
  );
  const publicWithLayout = await request.get(
    `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
  );
  const markup = await publicWithLayout.text();
  expect(markup).toContain('data-site-global="header"');
  expect(markup).toContain('data-site-global-slot="page.header.top-right"');
});

test('custom extensions persist inside both Header and Footer layouts', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'layout-custom-extension',
  );
  const extensionId = `custom-phase-19-${Date.now()}`;
  const extensionName = `Phase 19 banner ${Date.now()}`;
  try {
    await responseJson(
      await request.post(`${apiBaseUrl}/extensions`, {
        data: {
          id: extensionId,
          name: extensionName,
          version: '1.0.0',
          render: {
            kind: 'banner',
            eyebrow: 'Phase 19',
            heading: 'Custom layout extension',
            body: 'This extension survived the layout lifecycle.',
            buttonLabel: '',
            buttonHref: '',
            accentColor: '#8cf0c5',
          },
        },
      }),
    );
    await responseJson(
      await request.post(`${apiBaseUrl}/extensions/${extensionId}/enable`, {
        data: {},
      }),
    );
    const header = await responseJson<{ id: string }>(
      await request.post(
        `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/headers`,
        { data: { kind: 'header', name: `__e2e__ Custom header ${Date.now()}` } },
      ),
    );
    const footer = await responseJson<{ id: string }>(
      await request.post(
        `${apiBaseUrl}/sites/${canonicalEnvironment.siteId}/layouts/footers`,
        { data: { kind: 'footer', name: `__e2e__ Custom footer ${Date.now()}` } },
      ),
    );
    await loginToCanonicalBuilder(page);
    await switchCanonicalBrowserContext(page, canonicalEnvironment);
    for (const [kind, id, label] of [
      ['headers', header.id, 'Header'] as const,
      ['footers', footer.id, 'Footer'] as const,
    ]) {
      await page.goto(
        `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/layouts/${kind}/${id}/builder`,
      );
      await expect(
        page.getByRole('button', { name: `${extensionName} add`, exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await page
        .getByRole('button', { name: `${extensionName} add`, exact: true })
        .click();
      const draftDocument = await page.evaluate(() => {
        const debug = (
          window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
        ).__payloadBuilderDebug;
        return debug?.getPayload();
      });
      expect(JSON.stringify(draftDocument)).toContain(extensionId);
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByText('Draft · Not published', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: `Publish ${label}`, exact: true }).click();
      await expect(page.getByText('Live · Up to date', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
    }
    await responseJson(
      await request.patch(`${apiBaseUrl}/pages/${temporaryPage.id}/layout`, {
        data: {
          attachments: [
            {
              id: randomUUID(),
              type: 'header',
              resourceId: header.id,
              slot: 'page.header.top',
              enabled: true,
            },
            {
              id: randomUUID(),
              type: 'footer',
              resourceId: footer.id,
              slot: 'page.footer.bottom',
              enabled: true,
            },
          ],
        },
      }),
    );
    await responseJson(
      await request.post(`${apiBaseUrl}/pages/${temporaryPage.id}/publish`, { data: {} }),
    );
    const publicPage = await request.get(
      `${rendererBaseUrl}/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`,
    );
    expect(
      (await publicPage.text()).match(
        new RegExp(`data-extension="${extensionId}"`, 'g'),
      ) ?? [],
    ).toHaveLength(2);
  } finally {
    await request.delete(`${apiBaseUrl}/extensions/${extensionId}`);
  }
});
