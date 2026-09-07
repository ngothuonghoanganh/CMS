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
  isComponentPropertyRequired,
  isComponentPropertyVisible,
  styleSchemaFor,
} from './component-registry';
import { PAGE_STYLE_PROPERTY_DEFINITIONS } from './style-registry';

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
    ).toEqual(['text', 'role']);
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

  it('uses explicit metadata for requiredness instead of property names', () => {
    const buttonHref = PAGE_COMPONENT_REGISTRY.button.propertiesSchema.find(
      (property) => property.key === 'href',
    );
    const imageSource = PAGE_COMPONENT_REGISTRY.image.propertiesSchema.find(
      (property) => property.key === 'src',
    );
    expect(buttonHref).toMatchObject({ required: true, control: 'link' });
    expect(imageSource).toMatchObject({ allowEmpty: true });
    expect(buttonHref && isComponentPropertyRequired(buttonHref)).toBe(true);
    expect(imageSource && isComponentPropertyRequired(imageSource)).toBe(false);
    expect(
      isComponentPropertyRequired({
        key: 'href',
        label: 'Optional destination',
        group: 'content',
        control: 'url',
      }),
    ).toBe(false);

    const conditional = {
      key: 'columns',
      label: 'Columns',
      group: 'style' as const,
      control: 'number' as const,
      requiredWhen: { property: 'layout', operator: 'equals' as const, value: 'grid' },
      visibleWhen: { property: 'layout', operator: 'equals' as const, value: 'grid' },
    };
    expect(isComponentPropertyRequired(conditional, { layout: 'stack' })).toBe(false);
    expect(isComponentPropertyRequired(conditional, { layout: 'grid' })).toBe(true);
    expect(isComponentPropertyVisible(conditional, { layout: 'stack' })).toBe(false);
    expect(isComponentPropertyVisible(conditional, { layout: 'grid' })).toBe(true);
  });

  it('exposes semantic layout choices and conditional layout fields', () => {
    const layout = PAGE_STYLE_PROPERTY_DEFINITIONS.find(
      (property) => property.key === 'display',
    );
    expect(layout).toMatchObject({ control: 'layout', label: 'Layout' });
    expect(layout?.options?.map((option) => option.label)).toEqual(
      expect.arrayContaining(['Stack', 'Row', 'Grid']),
    );
    expect(
      PAGE_STYLE_PROPERTY_DEFINITIONS.find(
        (property) => property.key === 'grid-template-columns',
      ),
    ).toMatchObject({ visibleWhen: { property: 'display', value: 'grid' } });
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
      expect.objectContaining({
        key: 'form',
        control: 'custom',
        customEditor: 'form',
        editingScope: 'design',
      }),
    );
    expect(PAGE_COMPONENT_REGISTRY['collection-list'].propertiesSchema).toContainEqual(
      expect.objectContaining({ key: 'queryId', editingScope: 'design' }),
    );
    expect(styleSchemaFor('heading').map((property) => property.key)).toContain(
      'font-size',
    );
    expect(styleSchemaFor('divider').map((property) => property.key)).toContain(
      'border-color',
    );
    expect(styleSchemaFor('video').map((property) => property.key)).toContain('width');
  });

  it('keeps the capability contract explicit for semantic and behavioral properties', () => {
    const propertyScopes = [
      ['heading', 'level', 'content'],
      ['list', 'ordered', 'content'],
      ['list', 'items', 'design'],
      ['video', 'controls', 'design'],
      ['video', 'autoplay', 'design'],
      ['video', 'muted', 'design'],
      ['video', 'loop', 'design'],
      ['video', 'playsInline', 'design'],
      ['accordion', 'allowMultiple', 'design'],
      ['accordion', 'headingLevel', 'design'],
      ['accordion-item', 'defaultOpen', 'design'],
      ['tabs', 'orientation', 'design'],
      ['tabs', 'activationMode', 'design'],
      ['global-header', 'position', 'design'],
      ['navigation-view', 'source', 'design'],
      ['navigation-view', 'orientation', 'design'],
      ['navigation-view', 'mobileBehavior', 'design'],
      ['navigation-view', 'alignment', 'design'],
      ['site-brand', 'display', 'design'],
      ['form', 'form', 'design'],
      ['collection-list', 'queryId', 'design'],
    ] as const;

    for (const [component, property, editingScope] of propertyScopes) {
      expect(
        PAGE_COMPONENT_REGISTRY[component].propertiesSchema.find(
          (candidate) => candidate.key === property,
        ),
        `${component}.${property}`,
      ).toMatchObject({ editingScope });
    }
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
    expect(findAcceptingSlot('global-header', 'navigation-view', 100)).toMatchObject({
      structural: true,
    });
    expect(canRemoveChild('accordion', 'accordion-item', 1)).toBe(false);
    expect(canRemoveChild('accordion', 'accordion-item', 2)).toBe(true);
    expect(canDuplicateChild('tabs', 'tab-item', 20)).toBe(false);
  });

  it('keeps Design System exposure metadata aligned with the style registry', () => {
    const knownProperties = new Set(
      PAGE_STYLE_PROPERTY_DEFINITIONS.map((property) => property.key),
    );
    for (const definition of Object.values(PAGE_COMPONENT_REGISTRY)) {
      const exposure = definition.designSystem;
      if (!exposure) continue;
      for (const property of exposure.controls) {
        expect(knownProperties.has(property), `${definition.type}.${property}`).toBe(
          true,
        );
      }
      for (const part of exposure.parts ?? []) {
        expect(
          definition.componentParts[part],
          `${definition.type}.${part}`,
        ).toBeDefined();
      }
    }
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
