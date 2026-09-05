import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { canonicalEnvironmentNames, test } from './fixtures/canonical-environment';

const apiBase = process.env.E2E_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

async function readJson<T>(response: import('@playwright/test').APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${response.status()} ${response.url()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

test('Phase 20 collections, filtered lists, dynamic pages, and draft/public isolation @phase20', async ({
  request,
  canonicalEnvironment,
}) => {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const scope = `${apiBase}/workspaces/${canonicalEnvironment.workspaceId}/sites/${canonicalEnvironment.siteId}`;
  const entryIds: string[] = [];
  let collectionId: string | undefined;

  try {
    const collection = await readJson<{ id: string }>(
      await request.post(`${scope}/collections`, {
        data: {
          key: `products-${suffix}`,
          name: 'Products',
          singularName: 'Product',
          titleFieldKey: 'name',
          fields: [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'slug', label: 'Slug', type: 'slug', required: true, unique: true },
            { key: 'image', label: 'Image', type: 'image', required: false },
            { key: 'price', label: 'Price', type: 'number', required: true },
            {
              key: 'description',
              label: 'Description',
              type: 'long-text',
              required: false,
            },
            { key: 'featured', label: 'Featured', type: 'boolean', required: true },
          ],
        },
      }),
    );
    collectionId = collection.id;

    const products = [
      {
        name: 'Product A',
        slug: `product-a-${suffix}`,
        image: '/assets/a.png',
        price: 100,
        description: 'Old product A',
        featured: true,
      },
      {
        name: 'Product B',
        slug: `product-b-${suffix}`,
        image: '/assets/b.png',
        price: 200,
        description: 'Product B',
        featured: true,
      },
      {
        name: 'Hidden Product',
        slug: `hidden-${suffix}`,
        image: '/assets/hidden.png',
        price: 50,
        description: 'Hidden',
        featured: false,
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        name: `Catalog Product ${index + 1}`,
        slug: `catalog-product-${index + 1}-${suffix}`,
        image: `/assets/catalog-${index + 1}.png`,
        price: 300 + index,
        description: `Catalog product ${index + 1}`,
        featured: false,
      })),
    ];
    for (const values of products) {
      const entry = await readJson<{ id: string }>(
        await request.post(`${scope}/collections/${collectionId}/entries`, {
          data: { values },
        }),
      );
      entryIds.push(entry.id);
      await readJson(
        await request.post(
          `${scope}/collections/${collectionId}/entries/${entry.id}/publish`,
        ),
      );
    }

    const query = {
      filters: [{ field: 'featured', operator: 'equals', value: true }],
      sort: [{ field: 'price', direction: 'desc' }],
      limit: 100,
      offset: 0,
    };
    const filtered = await readJson<{
      items: Array<{ values: { name: string } }>;
      pagination: { total: number };
    }>(await request.post(`${scope}/collections/${collectionId}/query`, { data: query }));
    expect(filtered.pagination.total).toBe(2);
    expect(filtered.items.map((item) => item.values.name)).toEqual([
      'Product B',
      'Product A',
    ]);

    const listQueryId = randomUUID();
    const listHeadingId = `heading-${randomUUID()}`;
    const listPayload = {
      version: 7 as const,
      metadata: { documentTitle: 'Featured Products' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'list',
            type: 'collection-list' as const,
            props: { queryId: listQueryId, emptyMessage: 'No products' },
            children: [
              {
                id: 'item',
                type: 'collection-item' as const,
                props: {},
                children: [
                  {
                    id: listHeadingId,
                    type: 'heading' as const,
                    props: { text: 'Fallback', level: 2 as const },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const listPage = await readJson<{ id: string }>(
      await request.patch(`${apiBase}/pages/${canonicalEnvironment.pageId}`, {
        data: {
          name: `__e2e__ Phase 20 product list ${suffix}`,
          path: `/phase20-list-${suffix}`,
          slug: `phase20-list-${suffix}`,
          payload: listPayload,
          composition: {
            payload: listPayload,
            attachments: [],
            layoutAttachments: [],
            bindings: [
              {
                id: randomUUID(),
                targetNodeId: listHeadingId,
                targetProperty: 'text',
                source: { type: 'query-item', sourceId: listQueryId, path: 'name' },
                fallback: 'Product',
              },
            ],
            actions: [],
            resources: [],
            queries: [
              { id: listQueryId, source: { type: 'collection', collectionId }, ...query },
            ],
          },
        },
      }),
    );
    await readJson(
      await request.post(`${apiBase}/pages/${listPage.id}/publish`, { data: {} }),
    );

    const publicList = await readJson<{
      dataContext?: { queryItems?: Record<string, unknown[]> };
    }>(
      await request.get(
        `${apiBase}/public/sites/${canonicalEnvironment.siteSlug}/resolve?path=/phase20-list-${suffix}`,
      ),
    );
    expect(publicList.dataContext?.queryItems?.[listQueryId]).toHaveLength(2);

    const base = `/phase20-products-${suffix}`;

    const dynamicHeadingId = `heading-${randomUUID()}`;
    const dynamicPayload = {
      version: 7 as const,
      metadata: { documentTitle: 'Product detail' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'section',
            type: 'section' as const,
            props: {},
            children: [
              {
                id: dynamicHeadingId,
                type: 'heading' as const,
                props: { text: 'Fallback', level: 1 as const },
                children: [],
              },
            ],
          },
        ],
      },
    };
    const dynamicPage = await readJson<{ id: string }>(
      await request.patch(`${apiBase}/pages/${canonicalEnvironment.pageId}`, {
        data: {
          name: `__e2e__ Phase 20 Product detail ${suffix}`,
          kind: 'dynamic',
          collectionId,
          pathPattern: `${base}/{slug}`,
          lookupField: 'slug',
          payload: dynamicPayload,
          composition: {
            payload: dynamicPayload,
            attachments: [],
            layoutAttachments: [],
            bindings: [
              {
                id: randomUUID(),
                targetNodeId: dynamicHeadingId,
                targetProperty: 'text',
                source: { type: 'current-entry', path: 'name' },
                fallback: 'Product',
              },
            ],
            actions: [],
            resources: [],
            queries: [],
          },
        },
      }),
    );
    await readJson(
      await request.post(`${apiBase}/pages/${dynamicPage.id}/publish`, { data: {} }),
    );

    const productA = entryIds[0]!;
    await readJson(
      await request.patch(`${scope}/collections/${collectionId}/entries/${productA}`, {
        data: {
          expectedVersionNumber: 1,
          values: {
            ...products[0],
            name: 'New Product Name',
            description: 'New description',
          },
        },
      }),
    );
    const review = await readJson<{
      dataContext?: { currentEntry?: { values?: { name?: string } } };
    }>(
      await request.get(`${apiBase}/preview/pages/${dynamicPage.id}?entryId=${productA}`),
    );
    expect(review.dataContext?.currentEntry?.values?.name).toBe('New Product Name');

    const publicBeforePublish = await readJson<{
      dataContext?: { currentEntry?: { values?: { name?: string } } };
    }>(
      await request.get(
        `${apiBase}/public/sites/${canonicalEnvironment.siteSlug}/resolve?path=${base}/${products[0]!.slug}`,
      ),
    );
    expect(publicBeforePublish.dataContext?.currentEntry?.values?.name).toBe('Product A');

    await readJson(
      await request.post(
        `${scope}/collections/${collectionId}/entries/${productA}/publish`,
      ),
    );
    const publicAfterPublish = await readJson<{
      dataContext?: { currentEntry?: { values?: { name?: string } } };
    }>(
      await request.get(
        `${apiBase}/public/sites/${canonicalEnvironment.siteSlug}/resolve?path=${base}/${products[0]!.slug}`,
      ),
    );
    expect(publicAfterPublish.dataContext?.currentEntry?.values?.name).toBe(
      'New Product Name',
    );
  } finally {
    await request
      .post(`${apiBase}/pages/${canonicalEnvironment.pageId}/unpublish`)
      .catch(() => undefined);
    const baselinePayload = {
      version: 1 as const,
      metadata: { documentTitle: canonicalEnvironmentNames.pageName },
      root: { id: 'root', type: 'root' as const, props: {}, children: [] },
    };
    await request
      .patch(`${apiBase}/pages/${canonicalEnvironment.pageId}`, {
        data: {
          name: canonicalEnvironmentNames.pageName,
          path: '/',
          slug: 'e2e-home',
          kind: 'standard',
          payload: baselinePayload,
          composition: {
            payload: baselinePayload,
            attachments: [],
            layoutAttachments: [],
            bindings: [],
            actions: [],
            resources: [],
            queries: [],
          },
        },
      })
      .catch(() => undefined);
    if (collectionId) {
      for (const entryId of entryIds) {
        await request
          .delete(`${scope}/collections/${collectionId}/entries/${entryId}`)
          .catch(() => undefined);
      }
      await request.delete(`${scope}/collections/${collectionId}`).catch(() => undefined);
    }
  }
});
