import { describe, expect, it, vi } from 'vitest';

import type { CollectionService } from '../../domain/collection.service';
import { SeoCollectionAdapter } from './seo-collection.adapter';

describe('SeoCollectionAdapter', () => {
  it('forwards only the collection lookup required by SEO', async () => {
    const get = vi.fn().mockResolvedValue({ id: 'collection-1' });
    const adapter = new SeoCollectionAdapter({ get } as CollectionService);

    await expect(adapter.get('workspace-1', 'site-1', 'collection-1')).resolves.toEqual({
      id: 'collection-1',
    });
    expect(get).toHaveBeenCalledWith('workspace-1', 'site-1', 'collection-1');
  });
});
