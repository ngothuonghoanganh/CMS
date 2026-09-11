import { expect, request as playwrightRequest, type APIResponse } from '@playwright/test';

import { createTemporaryPage, test } from './fixtures/canonical-environment';
import { E2E_API_BASE_URL } from './fixtures/urls';

const apiBase = E2E_API_BASE_URL;

function payload(title: string) {
  return {
    version: 7 as const,
    metadata: { documentTitle: title },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'section-1',
          type: 'section' as const,
          props: {},
          children: [
            {
              id: 'heading-1',
              type: 'heading' as const,
              props: { level: 2 as const, text: title },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function tabsPayload(orientation: 'horizontal' | 'vertical') {
  return {
    version: 7 as const,
    metadata: { documentTitle: `__e2e__ ${orientation} tabs` },
    root: {
      id: 'root',
      type: 'root' as const,
      props: {},
      children: [
        {
          id: 'section-1',
          type: 'section' as const,
          props: {},
          children: [
            {
              id: 'tabs-1',
              type: 'tabs' as const,
              props: {
                orientation,
                ariaLabel: 'Tabs',
                activationMode: 'automatic' as const,
              },
              children: [
                {
                  id: 'tab-1',
                  type: 'tab-item' as const,
                  props: { label: 'Tab' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

async function readJson<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBe(true);
  return (await response.json()) as T;
}

test('Phase 21 closure keeps current-draft CAS, readiness summary and restore composition coherent', async ({
  request,
  canonicalEnvironment,
}) => {
  const firstPayload = payload('__e2e__ phase-21 closure v1');
  const secondPayload = payload('__e2e__ phase-21 closure v2');
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-21-closure',
    firstPayload,
  );
  try {
    const currentV1 = await readJson<{ id: string; versionNumber: number }>(
      await request.get(`${apiBase}/pages/${temporaryPage.id}/versions/current`),
    );
    expect(currentV1.versionNumber).toBe(1);

    const createdV2 = await readJson<{
      id: string;
      versionNumber: number;
      payload: unknown;
    }>(
      await request.post(`${apiBase}/pages/${temporaryPage.id}/versions`, {
        data: { expectedVersionNumber: 1, payload: secondPayload },
      }),
    );
    expect(createdV2.versionNumber).toBe(2);

    const currentV2 = await readJson<{ id: string; versionNumber: number }>(
      await request.get(`${apiBase}/pages/${temporaryPage.id}/versions/current`),
    );
    expect(currentV2).toMatchObject({ id: createdV2.id, versionNumber: 2 });

    const readiness = await readJson<{
      versionNumber: number;
      summary: { componentsAdded: number };
    }>(
      await request.get(
        `${apiBase}/pages/${temporaryPage.id}/publish-readiness?versionNumber=2`,
      ),
    );
    expect(readiness.versionNumber).toBe(2);
    expect(readiness.summary.componentsAdded).toBeGreaterThan(0);

    const staleSave = await request.post(
      `${apiBase}/pages/${temporaryPage.id}/versions`,
      {
        data: { expectedVersionNumber: 1, payload: firstPayload },
      },
    );
    expect(staleSave.status()).toBe(409);
    expect(((await staleSave.json()) as { error: { code: string } }).error.code).toBe(
      'PAGE_VERSION_CONFLICT',
    );

    const restored = await readJson<{
      id: string;
      versionNumber: number;
      payload: unknown;
      composition?: { queries: unknown[] };
    }>(
      await request.post(`${apiBase}/pages/${temporaryPage.id}/versions/1/restore`, {
        data: { expectedCurrentVersionNumber: 2 },
      }),
    );
    expect(restored.versionNumber).toBe(3);
    expect(restored.payload).toEqual(firstPayload);
    expect(restored.composition?.queries).toEqual([]);

    const restoredPage = await readJson<{
      currentDraftVersionId?: string;
      publishedVersionId?: string;
    }>(await request.get(`${apiBase}/pages/${temporaryPage.id}`));
    expect(restoredPage.currentDraftVersionId).toBe(restored.id);
    expect(restoredPage.publishedVersionId).toBeUndefined();
  } finally {
    await temporaryPage.dispose();
  }
});

test('Phase 21 closure rejects a direct design mutation from a content-only API user', async ({
  request,
  canonicalEnvironment,
}) => {
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-21-content-only',
  );
  const email = `phase-21-content-only-${Date.now()}@example.com`;
  const password = 'phase-21-content-only-password';
  let userId: string | undefined;
  let assignmentId: string | undefined;
  const userRequest = await playwrightRequest.newContext();
  const tabsPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-21-content-only-tabs',
    tabsPayload('horizontal'),
  );

  try {
    const roles = await readJson<{ items: Array<{ id: string; key: string }> }>(
      await request.get(`${apiBase}/roles`),
    );
    const editorRole = roles.items.find((role) => role.key === 'editor');
    expect(editorRole).toBeTruthy();

    const user = await readJson<{ user: { id: string } }>(
      await request.post(`${apiBase}/users`, {
        data: {
          email,
          displayName: 'Phase 21 Content Only',
          password,
          roleId: editorRole?.id,
          scope: 'workspace',
          workspaceId: canonicalEnvironment.workspaceId,
        },
      }),
    );
    userId = user.user.id;

    const assignments = await readJson<{ items: Array<{ id: string }> }>(
      await request.get(`${apiBase}/members/${userId}/roles`),
    );
    assignmentId = assignments.items[0]?.id;

    expect(
      (
        await userRequest.post(`${apiBase}/auth/login`, {
          data: { email, password, tenantSlug: canonicalEnvironment.organizationSlug },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await userRequest.post(`${apiBase}/auth/context`, {
          data: {
            organizationId: canonicalEnvironment.organizationId,
            workspaceId: canonicalEnvironment.workspaceId,
          },
        })
      ).status(),
    ).toBe(200);

    const createForbidden = await userRequest.post(
      `${apiBase}/sites/${canonicalEnvironment.siteId}/pages`,
      {
        data: {
          name: '__e2e__ content-only create attempt',
          path: `/phase-21-content-only-${Date.now()}`,
          payload: payload('Content-only create attempt'),
        },
      },
    );
    expect(createForbidden.status()).toBe(403);

    const forbidden = await userRequest.post(`${apiBase}/pages/${tabsPage.id}/versions`, {
      data: {
        expectedVersionNumber: 1,
        payload: tabsPayload('vertical'),
      },
    });
    expect(forbidden.status()).toBe(403);
    expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe(
      'PAGE_DESIGN_PERMISSION_REQUIRED',
    );
  } finally {
    if (assignmentId) {
      await request.delete(`${apiBase}/members/${userId}/roles/${assignmentId}`);
    }
    if (userId) await request.delete(`${apiBase}/users/${userId}`);
    await userRequest.dispose();
    await temporaryPage.dispose();
    await tabsPage.dispose();
  }
});

test('Phase 21 content mode saves editorial copy without exposing design controls', async ({
  browser,
  request,
  canonicalEnvironment,
}) => {
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-21-content-browser',
    payload('__e2e__ content browser v1'),
  );
  const email = `phase-21-content-browser-${Date.now()}@example.com`;
  const password = 'phase-21-content-browser-password';
  let userId: string | undefined;
  let assignmentId: string | undefined;
  const contentContext = await browser.newContext();
  const contentPage = await contentContext.newPage();

  try {
    const roles = await readJson<{ items: Array<{ id: string; key: string }> }>(
      await request.get(`${apiBase}/roles`),
    );
    const editorRole = roles.items.find((role) => role.key === 'editor');
    expect(editorRole).toBeTruthy();
    const user = await readJson<{ user: { id: string } }>(
      await request.post(`${apiBase}/users`, {
        data: {
          email,
          displayName: 'Phase 21 Browser Content Editor',
          password,
          roleId: editorRole?.id,
          scope: 'workspace',
          workspaceId: canonicalEnvironment.workspaceId,
        },
      }),
    );
    userId = user.user.id;
    const assignments = await readJson<{ items: Array<{ id: string }> }>(
      await request.get(`${apiBase}/members/${userId}/roles`),
    );
    assignmentId = assignments.items[0]?.id;

    await contentPage.goto('/login');
    await contentPage.getByLabel('Email').fill(email);
    await contentPage
      .getByLabel('Tenant slug')
      .fill(canonicalEnvironment.organizationSlug);
    await contentPage.getByLabel('Password').fill(password);
    await contentPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(contentPage).toHaveURL(/\/workspaces\/[^/]+$/);
    const switched = await contentPage.request.post(`${apiBase}/auth/context`, {
      data: {
        organizationId: canonicalEnvironment.organizationId,
        workspaceId: canonicalEnvironment.workspaceId,
      },
    });
    expect(switched.ok()).toBe(true);
    await contentPage.goto(
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/pages/${temporaryPage.id}/builder`,
    );
    await expect(
      contentPage.locator('.builder-editor-host iframe.gjs-frame'),
    ).toBeAttached();

    await expect(
      contentPage.getByRole('button', { name: 'Content', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      contentPage.getByRole('button', { name: 'Design', exact: true }),
    ).toHaveCount(0);
    await expect(
      contentPage.getByRole('button', { name: 'Add blocks', exact: true }),
    ).toHaveCount(0);
    await expect(
      contentPage.getByRole('button', { name: 'Layers', exact: true }),
    ).toHaveCount(0);
    await expect(
      contentPage.getByRole('button', { name: 'Assets', exact: true }),
    ).toBeVisible();

    const canvas = contentPage.frameLocator('iframe.gjs-frame');
    await canvas.locator('h2[data-payload-node-type="heading"]').click();
    const headingField = contentPage.getByLabel('Text content', { exact: true });
    await expect(headingField).toBeVisible();
    await headingField.fill('__e2e__ content-only persisted');
    await contentPage.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(contentPage.locator('.builder-save-status')).toContainText('Saved');

    await contentPage.reload();
    await expect(
      contentPage.locator('.builder-editor-host iframe.gjs-frame'),
    ).toBeAttached();
    await contentPage
      .frameLocator('iframe.gjs-frame')
      .locator('h2[data-payload-node-type="heading"]')
      .click();
    await expect(contentPage.getByLabel('Text content', { exact: true })).toHaveValue(
      '__e2e__ content-only persisted',
    );
  } finally {
    if (assignmentId) {
      await request.delete(`${apiBase}/members/${userId}/roles/${assignmentId}`);
    }
    if (userId) await request.delete(`${apiBase}/users/${userId}`);
    await contentContext.close();
    await temporaryPage.dispose();
  }
});

test('Phase 21 designer mode keeps structural save and reload available', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  const temporaryPage = await createTemporaryPage(
    request,
    canonicalEnvironment,
    'phase-21-designer-browser',
    payload('__e2e__ designer browser v1'),
  );

  try {
    await page.goto('/');
    if (new URL(page.url()).pathname === '/login') {
      await page.getByLabel('Email').fill(process.env.AUTH_EMAIL ?? 'admin@example.com');
      await page
        .getByLabel('Password')
        .fill(process.env.AUTH_PASSWORD ?? 'change-me-in-development');
      await page.getByRole('button', { name: 'Sign in' }).click();
    }
    await expect(page).toHaveURL(/\/workspaces\/[^/]+$/);
    await page.request.post(`${apiBase}/auth/context`, {
      data: {
        organizationId: canonicalEnvironment.organizationId,
        workspaceId: canonicalEnvironment.workspaceId,
      },
    });
    await page.goto(
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}/pages/${temporaryPage.id}/builder`,
    );
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: 'Add blocks', exact: true }).click();
    await page.getByRole('button', { name: 'Text add', exact: true }).click();
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await expect(
      page.getByRole('treeitem', { name: /Text: Edit this text/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.builder-save-status')).toContainText('Saved');

    await page.reload();
    await expect(page.locator('.builder-editor-host iframe.gjs-frame')).toBeAttached();
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await expect(
      page.getByRole('treeitem', { name: /Text: Edit this text/ }),
    ).toBeVisible();
  } finally {
    await temporaryPage.dispose();
  }
});
