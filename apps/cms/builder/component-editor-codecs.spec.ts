import { describe, expect, it } from 'vitest';

import {
  BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_QUOTE_PROPS_ATTRIBUTE,
  BUILDER_RESPONSIVE_STYLE_ATTRIBUTE,
} from './builder-adapter';
import {
  readComponentProps,
  applyEditorPropertyUpdate,
  selectionFromComponentCodec,
} from './component-editor-codecs';
import { resolveEditorPropertyUpdate } from './component-editor-bindings';

class FakeComponent {
  constructor(
    private readonly attributes: Record<string, string>,
    private readonly content = '',
    readonly children: FakeComponent[] = [],
  ) {}

  getAttributes(): Record<string, string> {
    return this.attributes;
  }

  get(name: string): unknown {
    return name === 'content' ? this.content : undefined;
  }

  getEl(): undefined {
    return undefined;
  }

  components(): { models: FakeComponent[] } {
    return { models: this.children };
  }
}

const asComponent = (component: FakeComponent) => component as never;

class MutableComponent {
  parentComponent?: MutableComponent;
  constructor(
    readonly attributes: Record<string, string>,
    readonly children: MutableComponent[] = [],
  ) {
    children.forEach((child) => {
      child.parentComponent = this;
    });
  }
  getAttributes(): Record<string, string> {
    return this.attributes;
  }
  setAttributes(next: Record<string, string>): void {
    Object.keys(this.attributes).forEach((key) => delete this.attributes[key]);
    Object.assign(this.attributes, next);
  }
  get(): unknown {
    return '';
  }
  set(): void {}
  parent(): MutableComponent | undefined {
    return this.parentComponent;
  }
  components(): { models: MutableComponent[] } {
    return { models: this.children };
  }
}

function attrs(id: string, type: string, extra: Record<string, string> = {}) {
  return {
    [BUILDER_NODE_ID_ATTRIBUTE]: id,
    [BUILDER_NODE_TYPE_ATTRIBUTE]: type,
    ...extra,
  };
}

describe('component editor codecs', () => {
  it('decodes compound semantic props and shallow structural children', () => {
    const item = new FakeComponent(
      attrs('item-1', 'accordion-item', {
        [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: JSON.stringify({
          title: 'Details',
          defaultOpen: true,
        }),
      }),
    );
    const accordion = new FakeComponent(
      attrs('accordion', 'accordion', {
        [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: JSON.stringify({ allowMultiple: false }),
        [BUILDER_RESPONSIVE_STYLE_ATTRIBUTE]: JSON.stringify({
          base: { gap: '16px' },
          mobile: { gap: '8px' },
        }),
      }),
      '',
      [item],
    );

    const selected = selectionFromComponentCodec(asComponent(accordion));
    expect(selected).toMatchObject({
      id: 'accordion',
      type: 'accordion',
      props: { allowMultiple: false },
      style: { base: { gap: '16px' }, mobile: { gap: '8px' } },
      children: [
        { id: 'item-1', type: 'accordion-item', label: 'Accordion Item: Details' },
      ],
    });
  });

  it('keeps quote editing in the CMS codec and rejects missing semantic metadata', () => {
    const quote = new FakeComponent(
      attrs('quote', 'quote', {
        [BUILDER_QUOTE_PROPS_ATTRIBUTE]: JSON.stringify({
          text: 'Keep it simple',
          cite: 'A. Author',
        }),
      }),
    );
    expect(readComponentProps(asComponent(quote), 'quote', '')).toEqual({
      props: { text: 'Keep it simple', cite: 'A. Author' },
    });
    expect(selectionFromComponentCodec(asComponent(quote))).toMatchObject({
      type: 'quote',
      props: { text: 'Keep it simple', cite: 'A. Author' },
    });
    expect(
      selectionFromComponentCodec(
        asComponent(new FakeComponent(attrs('unknown', 'unknown'))),
      ),
    ).toBeNull();
  });

  it('promotes V6 accessibility edits and normalizes one-open accordions atomically', () => {
    const first = new MutableComponent(
      attrs('item-1', 'accordion-item', {
        [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: JSON.stringify({
          title: 'First',
          defaultOpen: true,
        }),
      }),
    );
    const second = new MutableComponent(
      attrs('item-2', 'accordion-item', {
        [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: JSON.stringify({
          title: 'Second',
          defaultOpen: false,
        }),
      }),
    );
    const accordion = new MutableComponent(
      attrs('accordion', 'accordion', {
        [BUILDER_COMPOUND_PROPS_ATTRIBUTE]: JSON.stringify({ allowMultiple: false }),
      }),
      [first, second],
    );

    const openUpdate = resolveEditorPropertyUpdate('accordion-item', 'defaultOpen', true);
    expect(openUpdate).not.toBeNull();
    expect(
      applyEditorPropertyUpdate(second as never, 'accordion-item', openUpdate!),
    ).toBe(true);
    expect(JSON.parse(first.attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE]!)).toMatchObject(
      {
        defaultOpen: false,
      },
    );
    expect(
      JSON.parse(second.attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE]!),
    ).toMatchObject({
      defaultOpen: true,
    });

    const labelUpdate = resolveEditorPropertyUpdate('accordion', 'ariaLabel', 'FAQ');
    expect(labelUpdate).not.toBeNull();
    expect(applyEditorPropertyUpdate(accordion as never, 'accordion', labelUpdate!)).toBe(
      true,
    );
    expect(
      JSON.parse(accordion.attributes[BUILDER_COMPOUND_PROPS_ATTRIBUTE]!),
    ).toMatchObject({
      allowMultiple: false,
      headingLevel: 3,
      ariaLabel: 'FAQ',
    });
  });
});
