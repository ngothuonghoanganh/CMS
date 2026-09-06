import { expect, request as playwrightRequest, type APIResponse } from '@playwright/test';

import { createTemporaryPage, test } from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

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
          data: { email, password },
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

    const forbidden = await userRequest.post(
      `${apiBase}/pages/${temporaryPage.id}/versions`,
      {
        data: {
          expectedVersionNumber: 1,
          payload: payload('Design mutation'),
        },
      },
    );
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
  }
});
