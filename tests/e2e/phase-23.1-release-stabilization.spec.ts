import { expect, type Page } from '@playwright/test';

import {
  createTemporaryPage,
  loginToCanonicalBuilder,
  test,
} from './fixtures/canonical-environment';
import { E2E_API_BASE_URL, E2E_RENDERER_ORIGIN } from './fixtures/urls';

const apiBase = E2E_API_BASE_URL;

type BuilderNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: BuilderNode[];
};

type BuilderPayload = {
  version: number;
  root: BuilderNode;
  behaviors?: unknown[];
};

async function readPayload(page: Page): Promise<BuilderPayload | undefined> {
  return page.evaluate(() => {
    const debug = (
      window as Window & { __payloadBuilderDebug?: { getPayload: () => unknown } }
    ).__payloadBuilderDebug;
    return debug?.getPayload() as BuilderPayload | undefined;
  });
}

function findNode(root: BuilderNode, type: string): BuilderNode | undefined {
  if (root.type === type) return root;
  for (const child of root.children) {
    const result = findNode(child, type);
    if (result) return result;
  }
  return undefined;
}

function collectIds(root: BuilderNode): string[] {
  return [root.id, ...root.children.flatMap(collectIds)];
}

function legacyMigrationPayload() {
  return {
    version: 7 as const,
    metadata: { documentTitle: 'Legacy release gate' },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'legacy-section',
          type: 'section' as const,
          props: {},
          children: [
            {
              id: 'legacy-heading',
              type: 'heading' as const,
              props: { text: 'Legacy heading', level: 1 as const },
              children: [],
            },
            {
              id: 'legacy-copy',
              type: 'text' as const,
              props: { text: 'Legacy content survives promotion.' },
              children: [],
            },
            {
              id: 'legacy-image',
              type: 'image' as const,
              props: { src: '/assets/placeholder.png', alt: 'Legacy image' },
              children: [],
            },
            {
              id: 'legacy-button',
              type: 'button' as const,
              props: {
                label: 'Legacy action',
                href: '/legacy',
                target: '_self' as const,
              },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

async function openTemporaryBuilder(
  page: Page,
  temporaryPage: { id: string },
  environment: { organizationId: string; workspaceId: string; siteId: string },
) {
  await loginToCanonicalBuilder(page, environment);
  await page.goto(
    `/workspaces/${environment.workspaceId}/sites/${environment.siteId}/pages/${temporaryPage.id}/builder`,
  );
  await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
    timeout: 15_000,
  });
}

test('release gate promotes a V7 page in the browser without losing authored content', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-23-1-v7-migration',
    legacyMigrationPayload(),
  );

  try {
    await openTemporaryBuilder(page, temporaryPage, canonicalEnvironment);
    await expect.poll(async () => (await readPayload(page))?.version).toBe(7);
    const beforeIds = collectIds((await readPayload(page))!.root);

    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    const promoted = await readPayload(page);
    expect(promoted?.behaviors?.length).toBeGreaterThan(0);
    expect(findNode(promoted!.root, 'heading')?.props.text).toBe('Legacy heading');
    expect(findNode(promoted!.root, 'text')?.props.text).toBe(
      'Legacy content survives promotion.',
    );
    expect(findNode(promoted!.root, 'image')?.props.alt).toBe('Legacy image');
    expect(findNode(promoted!.root, 'button')?.props.label).toBe('Legacy action');
    expect(collectIds(promoted!.root)).toEqual(expect.arrayContaining(beforeIds));

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    await page.reload();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await expect
      .poll(async () => findNode((await readPayload(page))!.root, 'text')?.props.text)
      .toBe('Legacy content survives promotion.');

    const stored = (await (
      await page.request.get(`${apiBase}/pages/${temporaryPage.id}/versions/current`)
    ).json()) as { payload: BuilderPayload };
    expect(stored.payload.version).toBe(8);

    const publishResponse = await page.request.post(
      `${apiBase}/pages/${temporaryPage.id}/publish`,
      { data: {} },
    );
    expect(publishResponse.ok(), await publishResponse.text()).toBeTruthy();

    const publicPage = await browser.newPage({ baseURL: E2E_RENDERER_ORIGIN });
    try {
      await publicPage.goto(`/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`);
      await expect(
        publicPage.getByRole('heading', { name: 'Legacy heading' }),
      ).toBeVisible();
      await expect(
        publicPage.getByText('Legacy content survives promotion.', { exact: true }),
      ).toBeVisible();
      await expect(
        publicPage.getByRole('link', { name: 'Legacy action', exact: true }),
      ).toHaveAttribute('href', /\/legacy$/);
    } finally {
      await publicPage.close();
    }
  } finally {
    await temporaryPage.dispose();
  }
});

test('release gate publishes a V8 contact form and stores a real public submission', async ({
  browser,
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-23-1-public-contact-form',
  );

  try {
    await openTemporaryBuilder(page, temporaryPage, canonicalEnvironment);
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByRole('treeitem', { name: 'Select Form', exact: true }).click();
    const nameField = page
      .getByRole('treeitem', { name: 'Select Form field', exact: true })
      .first();
    await nameField.click();
    await page.getByLabel('Field label', { exact: true }).fill('Full name');

    const previewPromise = page.waitForEvent('popup');
    await page
      .getByRole('button', { name: /^(Preview|Live preview)$/ })
      .last()
      .click();
    const preview = await previewPromise;
    try {
      await expect(preview.getByText('Contact us', { exact: true })).toBeVisible();
      await expect(preview.getByLabel('Full name')).toBeVisible();
      await expect(preview.getByLabel('Email')).toBeVisible();
    } finally {
      await preview.close();
    }

    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved', {
      timeout: 15_000,
    });
    const publishResponse = await page.request.post(
      `${apiBase}/pages/${temporaryPage.id}/publish`,
      { data: {} },
    );
    expect(publishResponse.ok(), await publishResponse.text()).toBeTruthy();

    const publicPage = await browser.newPage({ baseURL: E2E_RENDERER_ORIGIN });
    const email = `phase-23-1-${Date.now()}@example.com`;
    try {
      await publicPage.goto(`/${canonicalEnvironment.siteSlug}/${temporaryPage.slug}`);
      await publicPage.getByRole('button', { name: 'Submit', exact: true }).click();
      const fullName = publicPage.getByLabel('Full name');
      expect(
        await fullName.evaluate((input) => (input as HTMLInputElement).validationMessage),
      ).not.toBe('');
      await publicPage.getByLabel('Full name').fill('Release Gate Visitor');
      await publicPage.getByLabel('Email').fill('not-an-email');
      await publicPage.getByRole('button', { name: 'Submit', exact: true }).click();
      expect(
        await publicPage
          .getByLabel('Email')
          .evaluate((input) => (input as HTMLInputElement).validity.typeMismatch),
      ).toBe(true);

      await publicPage.getByLabel('Email').fill(email);
      const submissionResponsePromise = publicPage.waitForResponse((response) =>
        response.url().includes('/submissions'),
      );
      await publicPage.getByRole('button', { name: 'Submit', exact: true }).click();
      const submissionResponse = await submissionResponsePromise;
      expect(submissionResponse.ok(), await submissionResponse.text()).toBeTruthy();
      await expect(publicPage.getByRole('status')).toContainText('Thanks');

      const submissionsResponse = await page.request.get(
        `${apiBase}/submissions?search=${encodeURIComponent(email)}&limit=20`,
      );
      expect(submissionsResponse.ok(), await submissionsResponse.text()).toBeTruthy();
      const submissions = (await submissionsResponse.json()) as {
        items: Array<{ data?: Record<string, unknown> }>;
      };
      expect(JSON.stringify(submissions.items)).toContain(email);
    } finally {
      await publicPage.close();
    }
  } finally {
    await temporaryPage.dispose();
  }
});

test('release gate survives rapid no-code selection, save, viewport, undo and reload actions', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  test.setTimeout(120_000);
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-23-1-chaos',
  );
  await openTemporaryBuilder(page, temporaryPage, canonicalEnvironment);

  const severeErrors: string[] = [];
  page.on('pageerror', (error) => severeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') severeErrors.push(message.text());
  });

  try {
    await page.getByRole('button', { name: 'Contact Form add', exact: true }).click();
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const form = page.getByRole('treeitem', { name: 'Select Form', exact: true });
    const field = page
      .getByRole('treeitem', { name: 'Select Form field', exact: true })
      .first();
    await form.dblclick();
    await field.click();
    await form.click();
    await field.click();
    await Promise.all([
      page.getByRole('button', { name: 'Save draft', exact: true }).click(),
      page.getByRole('button', { name: 'Save draft', exact: true }).click(),
      page.getByRole('button', { name: 'Save draft', exact: true }).click(),
    ]);
    await page.keyboard.press('Escape');
    for (const viewport of ['Tablet', 'Mobile', 'Desktop', 'Mobile', 'Desktop']) {
      await page.getByRole('button', { name: viewport, exact: true }).click();
    }
    await field.click();
    await page
      .getByRole('button', { name: 'Remove selected element', exact: true })
      .click();
    await page.keyboard.press('Control+z');
    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached({
      timeout: 15_000,
    });
    await expect.poll(async () => (await readPayload(page))?.version).toBe(8);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await expect(
      page.getByRole('treeitem', { name: 'Select Form', exact: true }),
    ).toBeVisible();
    expect(severeErrors).toEqual([]);
  } finally {
    await temporaryPage.dispose();
  }
});
