import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { describe, expect, it, vi } from 'vitest';

import { PageRecord } from '../persistence/schemas/page.schema';
import { PageSeoSettingsRecord } from '../persistence/schemas/page-seo-settings.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';
import { WorkspaceRecord } from '../persistence/schemas/workspace.schema';
import { CustomDomainRecord } from '../persistence/schemas/custom-domain.schema';
import { TenantContext } from '../tenancy/tenant-context';
import { PAGE_EXTENSION_PORT } from '../shared/page-extension-port';
import { CollectionService } from './collection.service';
import { LayoutExtensionService } from './layout-extension.service';
import { NavigationService } from './navigation.service';
import { PublicPageResolver } from './public-page.resolver';
import { ReusableService } from './reusable.service';
import { SiteUrlService } from './site-url.service';

type TestResolver = {
  siteModel: { find: () => ReturnType<typeof query> };
  pageModel: { findOne: (filter: Record<string, string>) => ReturnType<typeof query> };
  findPublishedVersion: (page: unknown, site: unknown) => Promise<unknown>;
  toPublicContract: (site: unknown, page: unknown, version: unknown) => Promise<unknown>;
  resolveByPath: (siteSlug: string, path: string) => Promise<unknown>;
};

function query<T>(value: T) {
  return {
    exec: async () => value,
    limit() {
      return this;
    },
    sort() {
      return this;
    },
  };
}

describe('public page resolver', () => {
  it('resolves with the Core PageExtensionPort token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getModelToken(SiteRecord.name), useValue: {} },
        { provide: getModelToken(WorkspaceRecord.name), useValue: {} },
        { provide: getModelToken(PageRecord.name), useValue: {} },
        { provide: getModelToken(PageVersionRecord.name), useValue: {} },
        { provide: getModelToken(PageSeoSettingsRecord.name), useValue: {} },
        { provide: getModelToken(CustomDomainRecord.name), useValue: {} },
        { provide: TenantContext, useValue: {} },
        { provide: SiteUrlService, useValue: {} },
        { provide: NavigationService, useValue: {} },
        { provide: LayoutExtensionService, useValue: {} },
        { provide: PAGE_EXTENSION_PORT, useValue: {} },
        { provide: ReusableService, useValue: {} },
        { provide: CollectionService, useValue: {} },
        PublicPageResolver,
      ],
    }).compile();

    expect(moduleRef.get(PublicPageResolver)).toBeInstanceOf(PublicPageResolver);
    await moduleRef.close();
  });

  it('resolves the site homepage reference without a delivery-time repair write', async () => {
    const site = {
      _id: { toString: () => 'site-1' },
      slug: 'demo',
      workspaceId: 'workspace-1',
      homePageId: 'page-about',
    };
    const page = {
      _id: { toString: () => 'page-about' },
      siteId: 'site-1',
      workspaceId: 'workspace-1',
      publishedVersionId: 'version-1',
    };
    const pageFindOne = vi.fn().mockReturnValue(query(page));
    const service = Object.create(PublicPageResolver.prototype) as TestResolver;
    service.siteModel = { find: vi.fn().mockReturnValue(query([site])) };
    service.pageModel = { findOne: pageFindOne };
    service.findPublishedVersion = vi.fn().mockResolvedValue({});
    service.toPublicContract = vi.fn().mockResolvedValue({ page });

    await service.resolveByPath('demo', '/');

    expect(pageFindOne).toHaveBeenCalledWith({
      _id: 'page-about',
      siteId: 'site-1',
      workspaceId: 'workspace-1',
    });
    expect((site as { save?: unknown }).save).toBeUndefined();
  });

  it('uses the published bundle instead of mutable draft extension configuration', async () => {
    const pageId = '11111111-1111-4111-8111-111111111111';
    const siteId = '22222222-2222-4222-8222-222222222222';
    const workspaceId = '33333333-3333-4333-8333-333333333333';
    const versionId = '44444444-4444-4444-8444-444444444444';
    const payload = {
      version: 7 as const,
      metadata: { documentTitle: 'Published snapshot' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [],
      },
    };
    const composition = {
      pageId,
      payload,
      attachments: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          pageId,
          extensionId: 'draft-extension',
          enabled: true,
          configuration: {},
          resourceIds: [],
        },
      ],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
      queries: [],
    };
    const publishedBundle = {
      bundleVersion: 1 as const,
      pageId,
      versionNumber: 2,
      payload,
      attachments: [],
      layoutAttachments: [],
      bindings: [],
      actions: [],
      resources: [],
      queries: [],
      extensions: [
        {
          extensionId: 'published-extension',
          runtimeIds: ['published.runtime'],
          styleAssetIds: [],
          slots: [],
        },
      ],
      extensionVersions: { 'published-extension': '1.0.0' },
      capabilities: [],
      runtimeIds: [],
      styleAssetIds: [],
      compiledAt: '2026-09-24T00:00:00.000Z',
    };
    const site = {
      _id: { toString: () => siteId },
      name: 'Published site',
      slug: 'published-site',
      workspaceId,
      homePageId: pageId,
    };
    const page = {
      _id: { toString: () => pageId },
      siteId,
      workspaceId,
      name: 'Published page',
      path: '/published',
      slug: 'published',
      kind: 'standard',
      publishedVersionId: versionId,
    };
    const version = {
      _id: versionId,
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 2,
      payload,
      composition,
      publishedBundle,
    };
    const service = Object.create(PublicPageResolver.prototype) as PublicPageResolver;
    const state = service as unknown as Record<string, unknown>;
    state.siteModel = {
      findOne: vi.fn().mockReturnValue(query(site)),
    };
    state.seoModel = { findOne: vi.fn().mockReturnValue(query(null)) };
    state.workspaceModel = { findOne: vi.fn().mockReturnValue(query(null)) };
    state.tenantContext = { require: vi.fn().mockReturnValue({ slug: 'tenant-a' }) };
    state.siteUrls = {
      getPageUrl: vi.fn().mockReturnValue('https://example.com/published'),
    };
    state.layoutExtensions = {
      resolveComposition: vi.fn().mockResolvedValue({}),
    };
    state.navigation = {
      resolveForSite: vi.fn().mockResolvedValue(undefined),
      resolvePagePaths: vi.fn().mockResolvedValue({}),
    };
    state.reusables = { resolveForPayload: vi.fn().mockResolvedValue([]) };
    state.collections = {
      resolveDataContext: vi.fn().mockResolvedValue({ queryItems: {}, variables: {} }),
    };
    state.pageExtensions = {
      resolveRuntimeForComposition: vi.fn().mockResolvedValue([
        {
          extensionId: 'draft-extension',
          runtimeIds: ['draft.runtime'],
          styleAssetIds: [],
          slots: [],
        },
      ]),
      resolveRuntimeForLayoutDocuments: vi.fn().mockResolvedValue([]),
    };

    const result = await (
      service as unknown as {
        toPublicContract: (
          site: unknown,
          page: unknown,
          version: unknown,
        ) => Promise<{ extensions?: Array<{ extensionId: string }> }>;
      }
    ).toPublicContract(site, page, version);

    expect(result.extensions).toEqual([
      expect.objectContaining({ extensionId: 'published-extension' }),
    ]);
    expect(state.pageExtensions).toMatchObject({
      resolveRuntimeForComposition: expect.any(Function),
    });
    expect(
      (state.pageExtensions as { resolveRuntimeForComposition: ReturnType<typeof vi.fn> })
        .resolveRuntimeForComposition,
    ).not.toHaveBeenCalled();
  });
});
