import { describe, expect, it } from 'vitest';

import {
  BUILDER_HEADING_LEVEL_ATTRIBUTE,
  BUILDER_LIST_PROPS_ATTRIBUTE,
} from './builder-adapter';
import {
  createEditorPropertyCommand,
  resolveEditorPropertyUpdate,
} from './component-editor-bindings';

describe('registry property bindings', () => {
  it('maps semantic properties to finite editor mutations', () => {
    expect(resolveEditorPropertyUpdate('heading', 'level', 3)).toEqual({
      kind: 'attributes',
      attributes: { [BUILDER_HEADING_LEVEL_ATTRIBUTE]: '3' },
      tagName: 'h3',
    });
    expect(resolveEditorPropertyUpdate('text', 'text', '<b>Plain</b>')).toEqual({
      kind: 'content',
      value: 'Plain',
    });
    expect(resolveEditorPropertyUpdate('video', 'autoplay', true)).toEqual({
      kind: 'attributes',
      attributes: { autoplay: 'true', muted: 'true' },
    });
    expect(resolveEditorPropertyUpdate('video', 'muted', false)).toEqual({
      kind: 'attributes',
      attributes: { autoplay: 'false', muted: 'false' },
    });
  });

  it('validates unsafe URLs and complex custom values before dispatch', () => {
    expect(() =>
      resolveEditorPropertyUpdate('link', 'href', 'javascript:alert(1)'),
    ).toThrow();
    expect(() => resolveEditorPropertyUpdate('heading', 'level', 7)).toThrow();
    expect(() =>
      resolveEditorPropertyUpdate('video', 'src', 'data:text/html,boom'),
    ).toThrow();

    const update = resolveEditorPropertyUpdate('list', 'items', {
      ordered: false,
      items: [{ id: 'item-1', text: 'One' }],
    });
    expect(update).toMatchObject({
      kind: 'attributes',
      listProps: { ordered: false },
    });
    expect(
      update?.kind === 'attributes' && update.attributes[BUILDER_LIST_PROPS_ATTRIBUTE],
    ).toContain('item-1');
  });

  it('creates one command shape for every registry-backed property', () => {
    expect(createEditorPropertyCommand('heading-1', 'heading', 'text', 'Title')).toEqual({
      kind: 'set-property',
      nodeId: 'heading-1',
      property: 'text',
      value: 'Title',
    });
    expect(
      createEditorPropertyCommand('heading-1', 'heading', 'unknown', 'x'),
    ).toBeNull();
  });
});
