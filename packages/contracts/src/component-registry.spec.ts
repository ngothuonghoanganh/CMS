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

  it('registers V4 content properties and explicit style capabilities', () => {
    expect(PAGE_COMPONENT_REGISTRY.heading.propertiesSchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'text', control: 'textarea' }),
        expect.objectContaining({ key: 'level', control: 'select' }),
      ]),
    );
    expect(PAGE_COMPONENT_REGISTRY.list.propertiesSchema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ordered', control: 'toggle' }),
        expect.objectContaining({
          key: 'items',
          control: 'custom',
          customEditor: 'list',
        }),
      ]),
    );
    expect(PAGE_COMPONENT_REGISTRY.form.propertiesSchema).toContainEqual(
      expect.objectContaining({ key: 'form', control: 'custom', customEditor: 'form' }),
    );
    expect(styleSchemaFor('heading').map((property) => property.key)).toContain(
      'font-size',
    );
    expect(styleSchemaFor('divider').map((property) => property.key)).toContain(
      'border-color',
    );
    expect(styleSchemaFor('video').map((property) => property.key)).toContain('width');
  });
});
