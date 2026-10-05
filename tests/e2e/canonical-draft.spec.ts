import { randomUUID } from 'node:crypto';

import { test, expect } from './fixtures/canonical-environment';
import { E2E_API_BASE_URL } from './fixtures/urls';

test('creates a canonical page, saves its Draft and reloads exact content', async ({
  request,
  canonicalEnvironment,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const pageResponse = await request.post(
    `${E2E_API_BASE_URL}/sites/${canonicalEnvironment.siteId}/pages`,
    {
      data: { name: `__e2e__ canonical ${suffix}`, path: `/e2e-canonical-${suffix}` },
    },
  );
  expect(pageResponse.status()).toBe(201);
  const page = (await pageResponse.json()) as {
    id: string;
    currentDraftVersionId?: string;
  };
  expect(page.currentDraftVersionId).toBeUndefined();

  try {
    const initial = await request.get(`${E2E_API_BASE_URL}/pages/${page.id}/draft`);
    expect(initial.status()).toBe(200);
    const initialDraft = (await initial.json()) as { versionNumber: number };
    expect(initialDraft.versionNumber).toBe(1);

    const composition = {
      version: 1,
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'hero',
            type: 'section',
            props: {},
            children: [
              {
                id: 'copy',
                type: 'text',
                props: { text: 'Canonical E2E' },
                children: [],
              },
            ],
          },
        ],
      },
      settings: {},
    };
    const save = await request.put(`${E2E_API_BASE_URL}/pages/${page.id}/draft`, {
      data: { expectedVersionNumber: 1, composition },
    });
    expect(save.status()).toBe(200);
    const saved = (await save.json()) as { versionNumber: number; composition: unknown };
    expect(saved.versionNumber).toBe(2);
    expect(saved.composition).toEqual(composition);

    const reloaded = await request.get(`${E2E_API_BASE_URL}/pages/${page.id}/draft`);
    expect(reloaded.status()).toBe(200);
    expect(((await reloaded.json()) as { composition: unknown }).composition).toEqual(
      composition,
    );
  } finally {
    const removed = await request.delete(`${E2E_API_BASE_URL}/pages/${page.id}`);
    expect([204, 404]).toContain(removed.status());
  }
});
