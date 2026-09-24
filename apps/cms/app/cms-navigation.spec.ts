import { describe, expect, it } from 'vitest';

import { navigationSections } from './cms-navigation';

const allow = () => true;

describe('CMS navigation', () => {
  it('keeps the common website journey visible', () => {
    const sections = navigationSections(allow, 'dashboard');
    const labels = sections.flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(
      expect.arrayContaining(['Home', 'Websites', 'Pages', 'Media', 'Templates']),
    );
    expect(sections.map((section) => section.label)).toEqual([
      'Home',
      'Website',
      'Results',
      'More tools',
    ]);
  });

  it('opens the secondary group for a deep-linked advanced page', () => {
    const sections = navigationSections(allow, 'integrations');
    const moreTools = sections.find((section) => section.label === 'More tools');

    expect(moreTools?.collapsible).toBe(true);
    expect(moreTools?.open).toBe(true);
  });

  it('does not show tools the user cannot access', () => {
    const sections = navigationSections(
      (permission) => permission === 'site.read' || permission === 'page.read',
      'dashboard',
    );
    const labels = sections.flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(['Home', 'Websites', 'Pages']);
  });
});
