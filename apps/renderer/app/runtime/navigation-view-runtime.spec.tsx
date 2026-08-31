import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { NavigationViewRuntime } from './navigation-view-runtime';

describe('NavigationViewRuntime', () => {
  it('renders nested navigation with accessible submenu controls', () => {
    const markup = renderToStaticMarkup(
      <NavigationViewRuntime
        ariaLabel="Main navigation"
        alignment="left"
        id="main-navigation"
        items={[
          {
            id: 'products',
            label: 'Products',
            type: 'page',
            href: '/products',
            children: [
              { id: 'pricing', label: 'Pricing', type: 'page', href: '/pricing' },
            ],
          },
        ]}
        mobileBehavior="collapse"
        orientation="horizontal"
      />,
    );

    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Products submenu"');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain('Pricing');
  });
});
