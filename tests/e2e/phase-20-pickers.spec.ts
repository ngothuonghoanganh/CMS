import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { loginToCanonicalBuilder, test } from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

async function readJson<T>(response: import('@playwright/test').APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.url()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

test('Phase 20 asset and reference pickers search, paginate, save, and reload @phase20', async ({
  page,
  request,
  canonicalEnvironment,
}) => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspaceScope = `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}`;
  const siteScope = `${workspaceScope}/sites/${canonicalEnvironment.siteId}`;
  const collectionIds: string[] = [];
  const assetIds: string[] = [];

  try {
    await loginToCanonicalBuilder(page);
    const categories = await readJson<{ id: string }>(
      await request.post(`${siteScope}/collections`, {
        data: {
          key: `picker-categories-${suffix}`,
          name: `__e2e__ Picker categories ${suffix}`,
          singularName: 'Picker category',
          titleFieldKey: 'name',
          fields: [{ key: 'name', label: 'Name', type: 'text', required: true }],
        },
      }),
    );
    collectionIds.push(categories.id);

    const categoryEntryIds: string[] = [];
    for (const name of ['Picker category Alpha', 'Picker category Beta']) {
      const entry = await readJson<{ id: string }>(
        await request.post(`${siteScope}/collections/${categories.id}/entries`, {
          data: { values: { name } },
        }),
      );
      categoryEntryIds.push(entry.id);
    }

    const products = await readJson<{ id: string }>(
      await request.post(`${siteScope}/collections`, {
        data: {
          key: `picker-products-${suffix}`,
          name: `__e2e__ Picker products ${suffix}`,
          singularName: 'Picker product',
          titleFieldKey: 'name',
          fields: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'hero_asset', label: 'Hero asset', type: 'asset', required: false },
            {
              key: 'primary_category',
              label: 'Primary category',
              type: 'reference',
              required: false,
              targetCollectionId: categories.id,
              cardinality: 'one',
            },
            {
              key: 'related_categories',
              label: 'Related categories',
              type: 'reference',
              required: false,
              targetCollectionId: categories.id,
              cardinality: 'many',
            },
          ],
        },
      }),
    );
    collectionIds.push(products.id);

    const targetFilename = `phase20-picker-target-${suffix}.png`;
    const targetAsset = await readJson<{ id: string }>(
      await request.post(`${workspaceScope}/assets`, {
        data: {
          filename: targetFilename,
          mimeType: 'image/png',
          size: 128,
          storageKey: `/assets/${targetFilename}`,
        },
      }),
    );
    assetIds.push(targetAsset.id);

    // Keep the target outside the first page so the picker must use its
    // server-side search rather than filtering a preloaded slice.
    await new Promise((resolve) => setTimeout(resolve, 5));
    for (let index = 0; index < 20; index += 1) {
      const filename = `phase20-picker-noise-${suffix}-${index}.png`;
      const asset = await readJson<{ id: string }>(
        await request.post(`${workspaceScope}/assets`, {
          data: {
            filename,
            mimeType: 'image/png',
            size: 128,
            storageKey: `/assets/${filename}`,
          },
        }),
      );
      assetIds.push(asset.id);
    }

    const productEntry = await readJson<{ id: string }>(
      await request.post(`${siteScope}/collections/${products.id}/entries`, {
        data: { values: { name: `Picker product ${suffix}` } },
      }),
    );

    const entryEditPath =
      `/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}` +
      `/collections/${products.id}/entries/${productEntry.id}/edit`;
    await page.goto(entryEditPath);
    const entryDrawer = page.getByRole('dialog', { name: 'Edit entry' });
    await expect(entryDrawer).toBeVisible();
    await expect(entryDrawer.getByText('Hero asset', { exact: true })).toBeVisible();

    const initialAssetResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.pathname.endsWith(`/workspaces/${canonicalEnvironment.workspaceId}/assets`) &&
        url.searchParams.get('offset') === '0' &&
        !url.searchParams.has('search')
      );
    });
    const assetDialog = page.getByRole('dialog', { name: 'Select asset' });
    await entryDrawer.getByRole('button', { name: 'Select asset', exact: true }).click();
    const initialAssetResponse = await initialAssetResponsePromise;
    const initialAssetPage = (await initialAssetResponse.json()) as {
      items: Array<{ filename: string }>;
      pagination: { hasNextPage: boolean };
    };
    expect(
      initialAssetPage.items.some((asset) => asset.filename === targetFilename),
    ).toBe(false);
    await expect(assetDialog).toBeVisible();
    await expect(
      assetDialog.getByRole('button', { name: 'Next', exact: true }),
    ).toBeEnabled();
    await assetDialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(assetDialog.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(initialAssetPage.pagination.hasNextPage).toBe(true);

    const assetSearchResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.pathname.endsWith(`/workspaces/${canonicalEnvironment.workspaceId}/assets`) &&
        url.searchParams.get('search') === targetFilename
      );
    });
    await assetDialog.getByLabel('Search assets').fill(targetFilename);
    await assetSearchResponsePromise;
    await expect(assetDialog.getByText(targetFilename, { exact: true })).toBeVisible();
    await assetDialog.getByRole('button', { name: 'Select', exact: true }).click();

    await entryDrawer
      .getByRole('button', { name: 'Select reference', exact: true })
      .first()
      .click();
    const primaryReferenceDialog = page.getByRole('dialog', {
      name: 'Select Picker category',
    });
    await expect(primaryReferenceDialog).toBeVisible();
    const primaryReferenceSearchPromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.pathname.endsWith(`/collections/${categories.id}/entries`) &&
        url.searchParams.get('search') === 'Alpha'
      );
    });
    await primaryReferenceDialog.getByLabel('Search entries').fill('Alpha');
    await primaryReferenceSearchPromise;
    await expect(
      primaryReferenceDialog.getByText('Picker category Alpha', { exact: true }),
    ).toBeVisible();
    await primaryReferenceDialog
      .getByRole('button', { name: 'Select', exact: true })
      .click();

    await entryDrawer
      .getByRole('button', { name: 'Select reference', exact: true })
      .last()
      .click();
    const relatedReferenceDialog = page.getByRole('dialog', {
      name: 'Select Picker category',
    });
    await expect(relatedReferenceDialog).toBeVisible();
    await relatedReferenceDialog.getByLabel('Search entries').fill('Alpha');
    await expect(
      relatedReferenceDialog.getByText('Picker category Alpha', { exact: true }),
    ).toBeVisible();
    await relatedReferenceDialog
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await relatedReferenceDialog.getByLabel('Search entries').fill('Beta');
    await expect(
      relatedReferenceDialog.getByText('Picker category Beta', { exact: true }),
    ).toBeVisible();
    await relatedReferenceDialog
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await relatedReferenceDialog
      .getByRole('button', { name: 'Done', exact: true })
      .click();

    await entryDrawer.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${entryEditPath.replace(/\/edit$/, '')}$`));

    const savedEntry = await readJson<{
      values: Record<string, unknown>;
    }>(
      await request.get(
        `${siteScope}/collections/${products.id}/entries/${productEntry.id}`,
      ),
    );
    expect(savedEntry.values.hero_asset).toBe(targetAsset.id);
    expect(savedEntry.values.primary_category).toBe(categoryEntryIds[0]);
    expect(savedEntry.values.related_categories).toEqual(categoryEntryIds);

    await page.goto(entryEditPath);
    const reloadedDrawer = page.getByRole('dialog', { name: 'Edit entry' });
    await expect(reloadedDrawer).toBeVisible();
    await expect(reloadedDrawer.getByText(targetFilename, { exact: true })).toBeVisible();
    await expect(
      reloadedDrawer.getByText('Picker category Alpha', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      reloadedDrawer.getByText('Picker category Beta', { exact: true }),
    ).toBeVisible();
  } finally {
    for (const collectionId of collectionIds.reverse()) {
      const entriesResponse = await request.get(
        `${siteScope}/collections/${collectionId}/entries?limit=100&offset=0`,
      );
      if (entriesResponse.ok()) {
        const entries = (await entriesResponse.json()) as {
          items: Array<{ id: string }>;
        };
        for (const entry of entries.items) {
          await request
            .delete(`${siteScope}/collections/${collectionId}/entries/${entry.id}`)
            .catch(() => undefined);
        }
      }
      await request
        .delete(`${siteScope}/collections/${collectionId}`)
        .catch(() => undefined);
    }
    for (const assetId of assetIds) {
      await request.delete(`${workspaceScope}/assets/${assetId}`).catch(() => undefined);
    }
  }
});
