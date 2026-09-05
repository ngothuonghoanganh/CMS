import { describe, expect, it } from 'vitest';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_COMPONENT_STYLE_CAPABILITIES,
  MULTI_SLOT_TEST_COMPONENT_DEFINITION,
  MULTI_SLOT_TEST_REGISTRY,
  assertStructuralSlotRegistry,
  canDuplicateChild,
  canInsertChild,
  canRemoveChild,
  createStructuralSlotEngine,
  findAcceptingSlot,
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

  it('marks content fields and design fields from the shared registry', () => {
    expect(
      PAGE_COMPONENT_REGISTRY.text.propertiesSchema.find(
        (property) => property.key === 'text',
      ),
    ).toMatchObject({ editingScope: 'content' });
    expect(
      PAGE_COMPONENT_REGISTRY.text.propertiesSchema.find(
        (property) => property.key === 'font-size',
      ),
    ).toMatchObject({ editingScope: 'design' });
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

  it('describes compound structure and builder exposure in the registry', () => {
    expect(PAGE_COMPONENT_REGISTRY.accordion.builder.insertable).toBe(true);
    expect(PAGE_COMPONENT_REGISTRY['accordion-item'].builder.insertable).toBe(false);
    expect(PAGE_COMPONENT_REGISTRY['tab-item'].builder.insertable).toBe(false);
    expect(PAGE_COMPONENT_REGISTRY.gallery.builder.insertable).toBe(true);

    expect(findAcceptingSlot('accordion', 'accordion-item', 0)).toMatchObject({
      minChildren: 1,
      maxChildren: 20,
      structural: true,
    });
    expect(findAcceptingSlot('tabs', 'text')).toBeUndefined();
    expect(findAcceptingSlot('gallery', 'button')).toBeUndefined();
    expect(canInsertChild('gallery', 'image', 49)).toBe(true);
    expect(canInsertChild('gallery', 'image', 50)).toBe(false);
    expect(canRemoveChild('accordion', 'accordion-item', 1)).toBe(false);
    expect(canRemoveChild('accordion', 'accordion-item', 2)).toBe(true);
    expect(canDuplicateChild('tabs', 'tab-item', 20)).toBe(false);
  });

  it('tracks occupancy per slot and rejects implicit ambiguous placement', () => {
    const engine = createStructuralSlotEngine(MULTI_SLOT_TEST_REGISTRY);
    const parent = {
      type: MULTI_SLOT_TEST_COMPONENT_DEFINITION.type,
      children: [
        { type: 'text' as const, slot: 'primary' },
        { type: 'image' as const, slot: 'secondary' },
      ],
    };

    expect(engine.resolveSlotsForChild(parent.type, 'text')).toHaveLength(2);
    expect(engine.resolveSlotForChild(parent.type, 'text')).toBeUndefined();
    expect(
      engine.canInsertIntoSlot({
        parentType: parent.type,
        slotName: 'primary',
        childType: 'text',
        occupancy: engine.getSlotOccupancy(parent, 'primary'),
      }),
    ).toBe(false);
    expect(
      engine.canInsertIntoSlot({
        parentType: parent.type,
        slotName: 'secondary',
        childType: 'image',
        occupancy: engine.getSlotOccupancy(parent, 'secondary'),
      }),
    ).toBe(false);
    const partiallyOccupiedParent = {
      type: MULTI_SLOT_TEST_COMPONENT_DEFINITION.type,
      children: [{ type: 'text' as const, slot: 'primary' }],
    };
    expect(engine.getSlotOccupancy(partiallyOccupiedParent, 'secondary')).toEqual({
      count: 0,
      bySlot: { secondary: 0 },
    });
    expect(
      engine.canInsertIntoSlot({
        parentType: partiallyOccupiedParent.type,
        slotName: 'secondary',
        childType: 'image',
        occupancy: engine.getSlotOccupancy(partiallyOccupiedParent, 'secondary'),
      }),
    ).toBe(true);
    expect(() => assertStructuralSlotRegistry(MULTI_SLOT_TEST_REGISTRY)).toThrow(
      'Ambiguous child placement',
    );
    expect(PAGE_COMPONENT_REGISTRY).not.toHaveProperty('multi-slot-test');
  });
});
