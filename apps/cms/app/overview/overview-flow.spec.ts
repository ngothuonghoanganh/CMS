import { describe, expect, it } from 'vitest';

import { getOverviewStep } from './overview-flow';

describe('overview first step', () => {
  it('starts with creating a website', () => {
    expect(getOverviewStep({ pageCount: 0, siteCount: 0 }).key).toBe('create-site');
  });

  it('moves to adding a page after a site exists', () => {
    expect(getOverviewStep({ pageCount: 0, siteCount: 1 })).toMatchObject({
      actionLabel: 'Add your first page',
      key: 'add-page',
    });
  });

  it('opens the page workflow when the workspace has content', () => {
    expect(getOverviewStep({ pageCount: 2, siteCount: 1 }).key).toBe('edit-page');
  });
});
