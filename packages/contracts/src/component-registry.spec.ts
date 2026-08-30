import { describe, expect, it } from 'vitest';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_COMPONENT_STYLE_CAPABILITIES,
  styleSchemaFor,
} from './component-registry';

describe('component style capabilities', () => {
  it('exposes style controls from the registry only', () => {
    expect(styleSchemaFor('image').map((property) => property.key)).not.toContain(
      'font-size',
    );
    expect(styleSchemaFor('container').map((property) => property.key)).not.toContain(
      'text-align',
    );
    expect(styleSchemaFor('text').map((property) => property.key)).toContain(
      'text-align',
    );
    expect(PAGE_COMPONENT_STYLE_CAPABILITIES.button).toContain('background-color');
    expect(
      PAGE_COMPONENT_REGISTRY.text.propertiesSchema
        .filter((property) => property.group === 'content')
        .map((property) => property.key),
    ).toEqual(['text']);
  });
});
