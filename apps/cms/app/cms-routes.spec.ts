import { describe, expect, it } from 'vitest';

import {
  collectionPath,
  cmsViewPath,
  pagePath,
  pagesPath,
  sitePath,
  templatePath,
  workspacePath,
} from './cms-routes';

describe('CMS route map', () => {
  it('builds workspace and site-scoped module paths', () => {
    expect(workspacePath('workspace/one')).toBe('/workspaces/workspace%2Fone');
    expect(sitePath('workspace-1', 'site-1')).toBe(
      '/workspaces/workspace-1/sites/site-1',
    );
    expect(pagesPath('workspace-1', 'site-1')).toBe(
      '/workspaces/workspace-1/sites/site-1/pages',
    );
    expect(cmsViewPath('workspace-1', 'assets')).toBe('/workspaces/workspace-1/assets');
    expect(cmsViewPath('workspace-1', 'collections', 'site-1')).toBe(
      '/workspaces/workspace-1/sites/site-1/collections',
    );
  });

  it('keeps resource actions as route segments', () => {
    expect(pagePath('w', 's', 'p', 'builder')).toBe(
      '/workspaces/w/sites/s/pages/p/builder',
    );
    expect(pagePath('w', 's', 'p', 'edit')).toBe('/workspaces/w/sites/s/pages/p/edit');
    expect(collectionPath('w', 's', 'c', 'entries')).toBe(
      '/workspaces/w/sites/s/collections/c/entries',
    );
    expect(templatePath('w', 't', 'edit')).toBe('/workspaces/w/templates/t/edit');
  });
});
