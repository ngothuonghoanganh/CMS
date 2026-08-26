import { describe, expect, it } from 'vitest';

import { ContributionRegistry } from './contribution-registry';

describe('ContributionRegistry', () => {
  it('indexes typed contributions and rejects collisions', () => {
    const registry = new ContributionRegistry();
    registry.register('commerce', {
      type: 'builder.element',
      id: 'product-card',
      label: 'Product card',
      nodeType: 'commerce.product-card',
      propertyKeys: ['productId'],
      allowedParents: ['container'],
      permissions: [],
    });

    expect(registry.has('builder.element', 'product-card')).toBe(true);
    expect(registry.get('builder.element', 'product-card')).toMatchObject({
      extensionId: 'commerce',
    });
    expect(registry.list('builder.element')).toHaveLength(1);
    expect(() =>
      registry.register('other-commerce', {
        type: 'builder.element',
        id: 'product-card',
        label: 'Other product card',
        nodeType: 'other.product-card',
        propertyKeys: [],
        allowedParents: [],
        permissions: [],
      }),
    ).toThrow('CONTRIBUTION_ID_DUPLICATE');
  });

  it('keeps trusted providers out of the contribution metadata contract', () => {
    const registry = new ContributionRegistry();
    const provider = { execute: () => 'trusted' };
    registry.register(
      'mail',
      {
        type: 'mail.provider',
        id: 'mail.send',
        label: 'Send mail',
        capability: 'mail.send',
        permissions: [],
      },
      provider,
    );

    expect(registry.get('mail.provider', 'mail.send')?.provider).toBe(provider);
    expect(registry.get('mail.provider', 'mail.send')?.contribution).not.toHaveProperty(
      'provider',
    );
  });
});
