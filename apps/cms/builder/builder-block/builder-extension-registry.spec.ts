import { describe, expect, it } from 'vitest';

import { ExtensionIds } from '@payload/contracts';

import {
  builderExtensionElement,
  isBuilderExtensionEnabled,
} from './builder-extension-registry';

describe('builder extension registry', () => {
  it('exposes a registered element only for an enabled tenant extension', () => {
    const element = builderExtensionElement('countdown');
    expect(element?.extensionId).toBe(ExtensionIds.DemoBuilder);
    expect(isBuilderExtensionEnabled('countdown', new Set())).toBe(false);
    expect(
      isBuilderExtensionEnabled('countdown', new Set([ExtensionIds.DemoBuilder])),
    ).toBe(true);
  });
});
