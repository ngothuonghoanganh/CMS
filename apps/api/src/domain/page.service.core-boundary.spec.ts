import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { createDefaultSiteDesignSystem, type PagePayload } from '@payload/contracts';
import { describe, expect, it, vi } from 'vitest';

import { CollectionService } from './collection.service';
import { LayoutExtensionService } from './layout-extension.service';
import { NavigationService } from './navigation.service';
import { PageService } from './page.service';
import { PublicPageResolver } from './public-page.resolver';
import { ReusableService } from './reusable.service';
import { SiteService } from './site.service';
import { PageRecord } from '../persistence/schemas/page.schema';
import { PageVersionRecord } from '../persistence/schemas/page-version.schema';
import { SiteRecord } from '../persistence/schemas/site.schema';
import { PageExtensionService } from '../extensions/page-extension.service';
import { CoreEventBus } from '../shared/events/core-event-bus';
import {
  CORE_EVENT_PUBLISHER,
  type CoreEventPublisher,
} from '../shared/events/core-event-publisher';
import { TenantContext } from '../tenancy/tenant-context';

const tenantId = 'tenant-a';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-09-23T00:00:00.000Z');

const payload = {
  version: 7,
  metadata: { documentTitle: 'Core boundary page' },
  root: {
    id: 'root',
    type: 'root',
    props: {},
    children: [
      {
        id: 'section-1',
        type: 'section',
        props: {},
        children: [],
      },
    ],
  },
} satisfies PagePayload;

function createTenantContext(): TenantContext {
  const tenantContext = new TenantContext();
  tenantContext.enter({
    id: tenantId,
    slug: tenantId,
    name: 'Tenant A',
    status: 'active',
    databaseKey: `mongo:${tenantId}`,
    databaseName: tenantId,
    schemaVersion: 1,
  });
  return tenantContext;
}

function query<T>(value: T) {
  return {
    select: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
}

function pageDocument(input: {
  id: string;
  name: string;
  path: string;
  currentDraftVersionId?: string;
}) {
  return {
    _id: input.id,
    workspaceId,
    siteId,
    name: input.name,
    path: input.path,
    slug: input.path.slice(1),
    kind: 'standard' as const,
    ...(input.currentDraftVersionId
      ? { currentDraftVersionId: input.currentDraftVersionId }
      : {}),
    createdAt: now,
    updatedAt: now,
    save: vi.fn().mockResolvedValue(undefined),
    deleteOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(undefined) })),
    set: vi.fn(),
  };
}

function createService(overrides: Record<string, unknown> = {}) {
  const service = Object.create(PageService.prototype) as PageService;
  const state = service as unknown as Record<string, unknown>;
  const tenantContext = createTenantContext();
  state.tenantContext = tenantContext;
  state.navigation = undefined;
  state.layoutExtensions = {};
  state.reusables = {};
  state.collections = {};
  state.publicPageResolver = {};
  state.pagePublishCompatibility = undefined;
  Object.assign(state, overrides);
  return { service, state, tenantContext };
}

describe('PageService core dependency boundary', () => {
  it('is resolvable without QuotaService or WorkflowModule providers', async () => {
    const tenantContext = createTenantContext();
    const eventPublisher: CoreEventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getModelToken(PageRecord.name), useValue: {} },
        { provide: getModelToken(PageVersionRecord.name), useValue: {} },
        { provide: getModelToken(SiteRecord.name), useValue: {} },
        { provide: PublicPageResolver, useValue: {} },
        { provide: CORE_EVENT_PUBLISHER, useValue: eventPublisher },
        { provide: PageExtensionService, useValue: {} },
        { provide: TenantContext, useValue: tenantContext },
        { provide: SiteService, useValue: {} },
        { provide: NavigationService, useValue: {} },
        { provide: LayoutExtensionService, useValue: {} },
        { provide: ReusableService, useValue: {} },
        { provide: CollectionService, useValue: {} },
        PageService,
      ],
    }).compile();

    expect(moduleRef.get(PageService)).toBeInstanceOf(PageService);
    await moduleRef.close();
  });

  it('creates without quota enforcement and keeps optional event failures out of persistence', async () => {
    const site = {
      _id: { toString: () => siteId },
      workspaceId,
    };
    const createdEvents: Record<string, unknown>[] = [];
    const coreEvents = new CoreEventBus(createTenantContext());
    coreEvents.subscribe('page.created', () => {
      throw new Error('optional subscriber failed');
    });
    coreEvents.subscribe('page.created', (event) => {
      createdEvents.push(event);
    });
    let createdPage: ReturnType<typeof pageDocument> | undefined;
    const pageModel = {
      findOne: vi.fn(() => query(null)),
      create: vi.fn(async (input: Record<string, unknown>) => {
        createdPage = pageDocument({
          id: String(input._id),
          name: String(input.name),
          path: String(input.path),
        });
        return createdPage;
      }),
    };
    const versionModel = {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn(() => query(null)),
    };
    const pageExtensions = {
      synchronizeComposition: vi.fn().mockResolvedValue(undefined),
      removeAllForPage: vi.fn().mockResolvedValue(undefined),
    };
    const { service, state } = createService({
      pageModel,
      versionModel,
      siteModel: { findOne: vi.fn(() => query(site)) },
      sites: { ensureHomePage: vi.fn().mockResolvedValue(undefined) },
      pageExtensions,
      events: coreEvents,
    });

    const result = await service.create(
      siteId,
      { name: 'Core page', path: '/core-page', payload },
      workspaceId,
    );

    expect(result).toMatchObject({
      name: 'Core page',
      path: '/core-page',
      workspaceId,
      siteId,
    });
    expect(state.quotas).toBeUndefined();
    expect(createdPage?.deleteOne).not.toHaveBeenCalled();
    expect(pageExtensions.removeAllForPage).not.toHaveBeenCalled();
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0]).toMatchObject({
      tenantId,
      pageId: createdPage?._id,
      workspaceId,
      siteId,
    });
    expect(createdEvents[0]).toHaveProperty('occurredAt');
  });

  it('rolls back page persistence when post-create extension synchronization fails', async () => {
    const site = {
      _id: { toString: () => siteId },
      workspaceId,
    };
    let createdPage: ReturnType<typeof pageDocument> | undefined;
    const pageModel = {
      findOne: vi.fn(() => query(null)),
      create: vi.fn(async (input: Record<string, unknown>) => {
        createdPage = pageDocument({
          id: String(input._id),
          name: String(input.name),
          path: String(input.path),
        });
        return createdPage;
      }),
    };
    const versionModel = {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn(() => query(null)),
    };
    const pageExtensions = {
      synchronizeComposition: vi.fn().mockRejectedValue(new Error('sync failed')),
      removeAllForPage: vi.fn().mockResolvedValue(undefined),
    };
    const { service } = createService({
      pageModel,
      versionModel,
      siteModel: { findOne: vi.fn(() => query(site)) },
      sites: { ensureHomePage: vi.fn().mockResolvedValue(undefined) },
      pageExtensions,
      events: { publish: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.create(
        siteId,
        { name: 'Core page', path: '/core-page', payload },
        workspaceId,
      ),
    ).rejects.toThrow('sync failed');
    expect(pageExtensions.removeAllForPage).toHaveBeenCalledWith(
      createdPage?._id,
      workspaceId,
    );
    expect(versionModel.deleteMany).toHaveBeenCalledWith({
      landingPageId: createdPage?._id,
    });
    expect(createdPage?.deleteOne).toHaveBeenCalled();
  });

  it('duplicates a page without quota enforcement', async () => {
    const source = pageDocument({
      id: pageId,
      name: 'Source page',
      path: '/source-page',
      currentDraftVersionId: 'version-1',
    });
    const sourceVersion = {
      _id: 'version-1',
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 1,
      payload,
      composition: {
        pageId,
        payload,
        attachments: [],
        layoutAttachments: [],
        bindings: [],
        actions: [],
        resources: [],
        queries: [],
      },
    };
    let duplicatedPage: ReturnType<typeof pageDocument> | undefined;
    const pageModel = {
      findOne: vi.fn(() => query(source)),
      exists: vi.fn().mockResolvedValue(null),
      create: vi.fn(async (input: Record<string, unknown>) => {
        duplicatedPage = pageDocument({
          id: String(input._id),
          name: String(input.name),
          path: String(input.path),
        });
        return duplicatedPage;
      }),
    };
    const versionModel = {
      findOne: vi.fn(() => query(sourceVersion)),
      create: vi.fn().mockResolvedValue({ _id: versionId }),
      deleteMany: vi.fn(() => query(null)),
    };
    const pageExtensions = {
      synchronizeComposition: vi.fn().mockResolvedValue(undefined),
      removeAllForPage: vi.fn().mockResolvedValue(undefined),
    };
    const { service, state } = createService({
      pageModel,
      versionModel,
      siteModel: { findOne: vi.fn(() => query({ _id: { toString: () => siteId } })) },
      pageExtensions,
    });

    const result = await service.duplicate(pageId, {}, workspaceId);

    expect(result).toMatchObject({
      name: 'Copy of Source page',
      path: '/source-page-copy',
    });
    expect(state.quotas).toBeUndefined();
    expect(pageExtensions.synchronizeComposition).toHaveBeenCalled();
    expect(duplicatedPage?.deleteOne).not.toHaveBeenCalled();
  });

  it('publishes page.updated and page.published through CoreEventPublisher', async () => {
    const page = pageDocument({ id: pageId, name: 'Original', path: '/original' });
    const events: CoreEventPublisher = {
      publish: vi.fn().mockResolvedValue(undefined),
    };
    const { service, state } = createService({
      pageModel: { findOne: vi.fn(() => query(page)) },
      versionModel: { findOne: vi.fn(() => query(null)) },
      events,
    });

    await service.update(pageId, { name: 'Updated' }, workspaceId);

    expect(events.publish).toHaveBeenCalledWith('page.updated', {
      tenantId,
      pageId,
      workspaceId,
      occurredAt: expect.any(String),
    });
    expect(state.workflows).toBeUndefined();
  });

  it('emits page.published only after durable version and page saves', async () => {
    const order: string[] = [];
    const page = pageDocument({
      id: pageId,
      name: 'Publishable',
      path: '/publishable',
      currentDraftVersionId: versionId,
    });
    page.save = vi.fn(async () => {
      order.push('page.save');
      return undefined;
    });
    const version = {
      _id: versionId,
      workspaceId,
      siteId,
      landingPageId: pageId,
      versionNumber: 1,
      payload,
      composition: {
        pageId,
        payload,
        attachments: [],
        layoutAttachments: [],
        bindings: [],
        actions: [],
        resources: [],
        queries: [],
      },
      set: vi.fn(),
      save: vi.fn(async () => {
        order.push('version.save');
        return undefined;
      }),
    };
    const events: CoreEventPublisher = {
      publish: vi.fn(async () => {
        order.push('event');
      }),
    };
    const pageExtensions = {
      validateBeforePublish: vi.fn().mockResolvedValue(undefined),
      compilePublishedBundle: vi.fn().mockResolvedValue({}),
      afterPublish: vi.fn().mockResolvedValue(undefined),
    };
    const { service } = createService({
      pageModel: {
        findOne: vi.fn((filter: Record<string, unknown>) =>
          filter._id === pageId ? query(page) : query(null),
        ),
      },
      versionModel: { findOne: vi.fn(() => query(version)) },
      pageExtensions,
      events,
      navigation: { validateInlineNavigationDocument: vi.fn() },
      reusables: {
        assertDependenciesAvailable: vi.fn(),
        assertDesignTokenDependenciesAvailable: vi.fn(),
      },
      sites: {
        getDesignSystem: vi
          .fn()
          .mockResolvedValue({ draft: createDefaultSiteDesignSystem() }),
      },
      collections: { validateComposition: vi.fn() },
      pagePublishCompatibility: {
        validateBeforePublish: vi.fn().mockResolvedValue(undefined),
      },
    });

    await service.publish(pageId, {}, workspaceId);

    expect(events.publish).toHaveBeenCalledWith('page.published', {
      tenantId,
      pageId,
      workspaceId,
      versionNumber: 1,
      occurredAt: expect.any(String),
    });
    expect(order).toEqual(['version.save', 'page.save', 'event']);
    expect(pageExtensions.afterPublish).toHaveBeenCalledWith(pageId, workspaceId, 1);
  });
});
