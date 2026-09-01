import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
  SiteGlobalPayloadV1Schema,
  type SiteGlobalPayloadV1,
  type SiteGlobals,
} from '@payload/contracts';

import { SiteService } from './site.service';

type Cursor<T> = {
  exec: () => Promise<T>;
};

type ServiceInternals = {
  siteModel: { findOne: (filter: unknown) => Cursor<unknown> };
  reusables: {
    assertDesignTokenDependenciesAvailableForValues: ReturnType<typeof vi.fn>;
  };
};

function cursor<T>(value: T): Cursor<T> {
  return { exec: async () => value };
}

function createGlobalDocument(
  documentKind: 'site-header' | 'site-footer',
  id: string,
): SiteGlobalPayloadV1 {
  return SiteGlobalPayloadV1Schema.parse({
    version: 1,
    documentKind,
    metadata: { documentTitle: id },
    root: {
      id: 'root',
      type: 'root',
      props: {},
      children: [
        {
          id: `${id}-global`,
          type: documentKind === 'site-header' ? 'global-header' : 'global-footer',
          props: documentKind === 'site-header' ? { position: 'static' } : {},
          children: [],
        },
      ],
    },
  });
}

function createRecord(globals: { draft?: SiteGlobals; published?: SiteGlobals }) {
  return {
    _id: { toString: () => 'site-1' },
    workspaceId: 'workspace-1',
    status: 'published',
    ...(globals.draft ? { globalsDraft: globals.draft } : {}),
    ...(globals.published ? { publishedGlobals: globals.published } : {}),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function setup(record: ReturnType<typeof createRecord>) {
  const service = Object.create(SiteService.prototype) as SiteService;
  const state = service as unknown as ServiceInternals;
  state.siteModel = {
    findOne: vi.fn().mockReturnValue(cursor(record)),
  };
  state.reusables = {
    assertDesignTokenDependenciesAvailableForValues: vi.fn().mockResolvedValue(undefined),
  };
  return { service, state };
}

describe('SiteService global resource lifecycle', () => {
  it('lazily forks published resources and isolates response mutations', async () => {
    const publishedHeader = createGlobalDocument('site-header', 'published-header');
    const record = createRecord({ published: { version: 1, header: publishedHeader } });
    const { service } = setup(record);

    const response = await service.getGlobals('workspace-1', 'site-1');

    expect(response.draft.header?.root.children[0]?.id).toBe('published-header-global');
    expect(response.state.header).toEqual({
      hasPublishedSnapshot: true,
      hasUnpublishedChanges: false,
    });
    if (!response.draft.header) throw new Error('Expected an effective header');
    response.draft.header.root.children[0]!.id = 'mutated-response';
    expect(record.publishedGlobals?.header?.root.children[0]?.id).toBe(
      'published-header-global',
    );
  });

  it('merges a scoped save and publishes only the selected resource', async () => {
    const draftFooter = createGlobalDocument('site-footer', 'draft-footer');
    const publishedHeader = createGlobalDocument('site-header', 'published-header');
    const publishedFooter = createGlobalDocument('site-footer', 'published-footer');
    const nextHeader = createGlobalDocument('site-header', 'draft-header');
    const record = createRecord({
      draft: { version: 1, footer: draftFooter },
      published: { version: 1, header: publishedHeader, footer: publishedFooter },
    });
    const { service, state } = setup(record);

    const saved = await service.updateGlobalResource(
      'workspace-1',
      'site-1',
      'header',
      nextHeader,
    );
    expect(saved.draft.header?.root.children[0]?.id).toBe('draft-header-global');
    expect(saved.draft.footer?.root.children[0]?.id).toBe('draft-footer-global');

    const published = await service.publishGlobalResource(
      'workspace-1',
      'site-1',
      'header',
    );
    expect(published.published?.header?.root.children[0]?.id).toBe('draft-header-global');
    expect(published.published?.footer?.root.children[0]?.id).toBe(
      'published-footer-global',
    );
    expect(
      state.reusables.assertDesignTokenDependenciesAvailableForValues,
    ).toHaveBeenCalledOnce();
    expect(record.save).toHaveBeenCalledTimes(2);
  });

  it('publishes an explicit resource removal without touching its sibling', async () => {
    const publishedHeader = createGlobalDocument('site-header', 'published-header');
    const publishedFooter = createGlobalDocument('site-footer', 'published-footer');
    const record = createRecord({
      draft: { version: 1, header: null },
      published: { version: 1, header: publishedHeader, footer: publishedFooter },
    });
    const { service } = setup(record);

    const response = await service.publishGlobalResource(
      'workspace-1',
      'site-1',
      'header',
    );

    expect(response.draft.header).toBeNull();
    expect(response.published?.header).toBeNull();
    expect(response.published?.footer?.root.children[0]?.id).toBe(
      'published-footer-global',
    );
    expect(response.state.header).toEqual({
      hasPublishedSnapshot: false,
      hasUnpublishedChanges: false,
    });
  });

  it('discards only the selected resource draft override', async () => {
    const publishedHeader = createGlobalDocument('site-header', 'published-header');
    const publishedFooter = createGlobalDocument('site-footer', 'published-footer');
    const draftHeader = createGlobalDocument('site-header', 'draft-header');
    const draftFooter = createGlobalDocument('site-footer', 'draft-footer');
    const record = createRecord({
      draft: { version: 1, header: draftHeader, footer: draftFooter },
      published: { version: 1, header: publishedHeader, footer: publishedFooter },
    });
    const { service } = setup(record);

    const response = await service.discardGlobalResource(
      'workspace-1',
      'site-1',
      'header',
    );

    expect(response.draft.header?.root.children[0]?.id).toBe('published-header-global');
    expect(response.draft.footer?.root.children[0]?.id).toBe('draft-footer-global');
    expect(response.state.header).toEqual({
      hasPublishedSnapshot: true,
      hasUnpublishedChanges: false,
    });
    expect(response.state.footer).toEqual({
      hasPublishedSnapshot: true,
      hasUnpublishedChanges: true,
    });
  });

  it('blocks a global publish when its design token is not live yet', async () => {
    const header = createGlobalDocument('site-header', 'token-header');
    const record = createRecord({ draft: { version: 1, header } });
    const { service, state } = setup(record);
    state.reusables.assertDesignTokenDependenciesAvailableForValues.mockRejectedValue(
      new ConflictException({
        code: 'DESIGN_TOKEN_DEPENDENCY_UNAVAILABLE',
        details: { tokenIds: ['brand-primary'] },
      }),
    );

    await expect(
      service.publishGlobalResource('workspace-1', 'site-1', 'header'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GLOBAL_DESIGN_TOKEN_DEPENDENCY_UNAVAILABLE',
        message: 'Publish the Design System or Site before publishing this header',
      }),
    });
    expect(record.publishedGlobals).toBeUndefined();
    expect(record.save).not.toHaveBeenCalled();
  });
});
