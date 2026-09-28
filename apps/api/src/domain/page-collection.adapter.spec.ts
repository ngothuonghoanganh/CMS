import { describe, expect, it, vi } from 'vitest';

import type { CollectionService } from './collection.service';
import { PageCollectionAdapter } from './page-collection.adapter';

describe('PageCollectionAdapter', () => {
  it('forwards only collection capabilities required by page workflows', async () => {
    const collection = { id: 'collection-1' };
    const entry = { id: 'entry-1' };
    const context = { queries: {} };
    const runtimeEntry = { id: 'entry-1' };
    const collections = {
      get: vi.fn().mockResolvedValue(collection),
      getEntry: vi.fn().mockResolvedValue(entry),
      validateComposition: vi.fn().mockResolvedValue(undefined),
      resolveDataContext: vi.fn().mockResolvedValue(context),
      resolvePublishedEntryByValue: vi.fn().mockResolvedValue(runtimeEntry),
    } as unknown as CollectionService;
    const adapter = new PageCollectionAdapter(collections);
    const composition = { pageId: 'page-1' } as never;
    const validationOptions = { currentEntryCollectionId: 'collection-1' };
    const contextOptions = { mode: 'published' as const };

    await expect(adapter.get('workspace-1', 'site-1', 'collection-1')).resolves.toEqual(
      collection,
    );
    await expect(
      adapter.getEntry('workspace-1', 'site-1', 'collection-1', 'entry-1', 'draft'),
    ).resolves.toEqual(entry);
    await adapter.validateComposition(
      'workspace-1',
      'site-1',
      composition,
      validationOptions,
    );
    await expect(
      adapter.resolveDataContext('workspace-1', 'site-1', composition, contextOptions),
    ).resolves.toEqual(context);
    await expect(
      adapter.resolvePublishedEntryByValue(
        'workspace-1',
        'site-1',
        'collection-1',
        'slug',
        'hello',
      ),
    ).resolves.toEqual(runtimeEntry);

    expect(collections.get).toHaveBeenCalledWith('workspace-1', 'site-1', 'collection-1');
    expect(collections.getEntry).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      'collection-1',
      'entry-1',
      'draft',
    );
    expect(collections.validateComposition).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      composition,
      validationOptions,
    );
    expect(collections.resolveDataContext).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      composition,
      contextOptions,
    );
    expect(collections.resolvePublishedEntryByValue).toHaveBeenCalledWith(
      'workspace-1',
      'site-1',
      'collection-1',
      'slug',
      'hello',
    );
  });
});
