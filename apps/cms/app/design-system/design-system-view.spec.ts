import { describe, expect, it } from 'vitest';

import { createDefaultSiteDesignSystem } from '@payload/contracts';

import {
  resolveComponentDefaultStyle,
  updateComponentDefault,
} from './design-system-view';

describe('design system component defaults', () => {
  it('updates a component default without materializing page-local styles', () => {
    const system = createDefaultSiteDesignSystem();
    const next = updateComponentDefault(system, 'button', 'borderRadius', {
      kind: 'token',
      tokenId: 'radius-sm',
    });

    expect(next.componentDefaults?.button?.style?.base.borderRadius).toEqual({
      kind: 'token',
      tokenId: 'radius-sm',
    });
    expect(next.componentDefaults?.heading?.style?.base.fontSize).toEqual({
      kind: 'token',
      tokenId: 'type-heading',
    });
  });

  it('resolves token-backed defaults into a preview style', () => {
    const style = resolveComponentDefaultStyle(createDefaultSiteDesignSystem(), 'button');

    expect(style).toMatchObject({
      backgroundColor: '#2563eb',
      color: '#ffffff',
      padding: '8px',
      borderRadius: '8px',
    });
  });

  it('can clear a component default to restore the built-in fallback', () => {
    const next = updateComponentDefault(
      createDefaultSiteDesignSystem(),
      'button',
      'borderRadius',
      undefined,
    );

    expect(next.componentDefaults?.button?.style?.base.borderRadius).toBeUndefined();
  });
});
