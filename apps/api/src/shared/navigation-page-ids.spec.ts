import { describe, expect, it } from 'vitest';

import { collectNavigationPageIds } from './navigation-page-ids';

describe('collectNavigationPageIds', () => {
  it('collects unique page and section references from a document tree', () => {
    expect(
      collectNavigationPageIds({
        root: {
          type: 'root',
          children: [
            { type: 'page', pageId: 'page-home' },
            { type: 'section', pageId: 'page-about' },
            { type: 'page', pageId: 'page-home' },
          ],
        },
      }),
    ).toEqual(['page-home', 'page-about']);
  });
});
