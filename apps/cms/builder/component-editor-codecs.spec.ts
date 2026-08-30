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
  selectionFromComponentCodec,
} from './component-editor-codecs';

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
});
