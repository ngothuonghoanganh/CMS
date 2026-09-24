import { describe, expect, it } from 'vitest';

import { navigationSections } from './cms-navigation';

const allow = () => true;

describe('CMS navigation', () => {
  it('keeps the primary navigation focused on user tasks', () => {
    const sections = navigationSections(allow, 'dashboard');
    const labels = sections.flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(['Home', 'Websites', 'Responses', 'Library', 'Settings']);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBeUndefined();
  });

  it('does not expose technical modules in the primary navigation', () => {
    const labels = navigationSections(allow, 'integrations').flatMap((section) =>
      section.items.map((item) => item.label),
    );

    expect(labels).not.toEqual(
      expect.arrayContaining(['More tools', 'Templates', 'Analytics', 'Extensions']),
    );
  });

  it('does not show tools the user cannot access', () => {
    const sections = navigationSections(
      (permission) => permission === 'site.read' || permission === 'page.read',
      'dashboard',
    );
    const labels = sections.flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(['Home', 'Websites']);
  });

  it('shows Settings when the user has a settings permission', () => {
    const sections = navigationSections(
      (permission) => permission === 'integration.read',
      'integrations',
    );
    const labels = sections.flatMap((section) => section.items.map((item) => item.label));

    expect(labels).toEqual(['Home', 'Settings']);
  });
});
