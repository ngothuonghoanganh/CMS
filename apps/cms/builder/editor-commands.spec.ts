import { describe, expect, it } from 'vitest';

import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_OPEN_COMPOSITION_ATTRIBUTE,
  BUILDER_OPEN_PROPS_ATTRIBUTE,
  BUILDER_OPEN_BEHAVIORS_ATTRIBUTE,
  createBlockDefinition,
} from './builder-block/builder-adapter';
import {
  createEditorCommandBus,
  executeEditorCommand,
  type EditorCommand,
} from './editor-commands';
import { createGlobalPresetDefinition } from './builder-block/block-presets';
import {
  assertUniquePersistedNodeIds,
  collectPersistedNodeIds,
} from './builder-node-identity';

class FakeComponent {
  private parentNode: FakeComponent | undefined;
  private content = '';
  private style: Record<string, string> = {};
  readonly children: FakeComponent[] = [];
  private readonly attrs: Record<string, unknown>;

  constructor(id: string, type: string, children: FakeComponent[] = [], content = '') {
    this.attrs = {
      [BUILDER_NODE_ID_ATTRIBUTE]: id,
      [BUILDER_NODE_TYPE_ATTRIBUTE]: type,
    };
    this.content = content;
    children.forEach((child) => this.append(child));
  }

  append(
    definition: FakeComponent | Record<string, unknown>,
    options?: { at?: number },
  ): FakeComponent[] {
    const fromDefinition = (value: Record<string, unknown>): FakeComponent => {
      const attributes = value.attributes as Record<string, unknown>;
      const children = Array.isArray(value.components)
        ? value.components
            .filter(
              (child): child is Record<string, unknown> =>
                typeof child === 'object' && child !== null,
            )
            .map((child) => fromDefinition(child))
        : [];
      const created = new FakeComponent(
        String(attributes[BUILDER_NODE_ID_ATTRIBUTE]),
        String(attributes[BUILDER_NODE_TYPE_ATTRIBUTE]),
        children,
        String(value.content ?? ''),
      );
      created.setAttributes(attributes);
      return created;
    };
    const child =
      definition instanceof FakeComponent ? definition : fromDefinition(definition);
    child.parentNode = this;
    const index = Math.min(
      Math.max(options?.at ?? this.children.length, 0),
      this.children.length,
    );
    this.children.splice(index, 0, child);
    return [child];
  }

  getAttributes(): Record<string, unknown> {
    return { ...this.attrs };
  }

  setAttributes(attributes: Record<string, unknown>): void {
    Object.assign(this.attrs, attributes);
  }

  removeAttributes(name: string): void {
    delete this.attrs[name];
  }

  parent(): FakeComponent | undefined {
    return this.parentNode;
  }

  index(): number {
    return this.parentNode?.children.indexOf(this) ?? -1;
  }

  components(): { models: FakeComponent[] };
  components(definitions: Record<string, unknown>[]): FakeComponent[];
  components(
    definitions?: Record<string, unknown>[],
  ): { models: FakeComponent[] } | FakeComponent[] {
    if (!definitions) return { models: this.children };
    this.children.splice(0, this.children.length);
    return definitions.flatMap((definition) => this.append(definition));
  }

  onAll(callback: (component: FakeComponent) => void): void {
    callback(this);
    this.children.forEach((child) => child.onAll(callback));
  }

  move(destination: FakeComponent, options?: { at?: number }): void {
    const sourceParent = this.parentNode;
    const sourceIndex = this.index();
    sourceParent?.children.splice(sourceIndex, 1);
    const requestedIndex = options?.at ?? destination.children.length;
    const index =
      sourceParent === destination && sourceIndex < requestedIndex
        ? requestedIndex - 1
        : requestedIndex;
    this.parentNode = destination;
    destination.children.splice(Math.max(0, index), 0, this);
  }

  get(name: string): unknown {
    if (name === 'content') return this.content;
    if (name === 'style') return this.style;
    return undefined;
  }

  set(name: string, value: unknown): void {
    if (name === 'content') this.content = String(value);
    if (name === 'style') this.style = { ...(value as Record<string, string>) };
  }

  getStyle(): Record<string, string> {
    return { ...this.style };
  }

  toJSON(): Record<string, unknown> {
    return {
      attributes: this.getAttributes(),
      content: this.content,
      components: this.children.map((child) => child.toJSON()),
    };
  }

  setStyle(style: Record<string, string>): void {
    this.style = { ...style };
  }
}

class FakeEditor {
  selected: FakeComponent | undefined;
  undoAvailable = false;
  redoAvailable = false;
  readonly UndoManager = {
    hasUndo: () => this.undoAvailable,
    hasRedo: () => this.redoAvailable,
  };

  constructor(readonly root: FakeComponent) {}

  getComponents(): { models: FakeComponent[] } {
    return { models: [this.root] };
  }

  select(component: FakeComponent | undefined): void {
    this.selected = component;
  }

  getSelected(): FakeComponent | undefined {
    return this.selected;
  }

  getModel(): this {
    return this;
  }

  runCommand(command: string): void {
    if (command === 'core:component-delete' && this.selected) {
      const parent = this.selected.parent();
      if (parent) parent.children.splice(parent.children.indexOf(this.selected), 1);
      this.selected = undefined;
    }
  }

  skip(callback: () => void): void {
    callback();
  }
}

const asEditor = (editor: FakeEditor) => editor as never;

function ids(parent: FakeComponent): string[] {
  return parent.children.map(
    (child) => child.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE] as string,
  );
}

describe('editor command boundary', () => {
  it('updates Open Composition props through the command bus', () => {
    const root = new FakeComponent('root', 'root');
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({}),
      'data-payload-open-behaviors': JSON.stringify([
        {
          id: 'field-behavior',
          kind: 'field',
          nodeId: 'field',
          formNodeId: 'form',
          fieldKey: 'email',
          inputType: 'email',
          required: true,
        },
      ]),
    });
    const text = new FakeComponent('text', 'text', [], 'Original');
    text.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ text: 'Original' }),
    });
    root.append(text);
    const field = new FakeComponent('field', 'form-field');
    field.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ required: true }),
    });
    root.append(field);
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'text',
        property: 'text',
        value: 'Updated',
      }).changed,
    ).toBe(true);
    expect(
      JSON.parse(text.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE] as string),
    ).toEqual({
      text: 'Updated',
    });
    expect(text.get('content')).toBe('Updated');

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'field',
        property: 'required',
        value: false,
      }).changed,
    ).toBe(true);
    expect(
      JSON.parse(root.getAttributes()['data-payload-open-behaviors'] as string)[0],
    ).toMatchObject({ required: false });
  });

  it('keeps a composed button label synchronized with its text child', () => {
    const icon = new FakeComponent('icon', 'icon');
    icon.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const text = new FakeComponent('button-text', 'text', [], 'Submit');
    text.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ text: 'Submit' }),
    });
    const button = new FakeComponent('button', 'button', [icon, text]);
    button.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ label: 'Submit' }),
    });
    const root = new FakeComponent('root', 'root', [button]);
    root.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'button',
        property: 'label',
        value: 'Send message',
      }).changed,
    ).toBe(true);
    expect(
      JSON.parse(String(button.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE])),
    ).toEqual({
      label: 'Send message',
    });
    expect(
      JSON.parse(String(text.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE])),
    ).toEqual({
      text: 'Send message',
    });
    expect(text.get('content')).toBe('Send message');
  });

  it('updates a Form Field through semantic aggregate properties', () => {
    const label = new FakeComponent('field-label', 'label', [], 'Name');
    label.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ text: 'Name' }),
    });
    const control = new FakeComponent('field-control', 'input');
    control.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
        type: 'text',
        name: 'name',
        placeholder: '',
      }),
    });
    const field = new FakeComponent('field', 'form-field', [label, control]);
    field.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
        fieldKey: 'name',
        required: false,
      }),
    });
    const form = new FakeComponent('form', 'form', [field]);
    form.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ formKey: 'contact' }),
    });
    const root = new FakeComponent('root', 'root', [form]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([
        {
          id: 'field-behavior',
          kind: 'field',
          nodeId: 'field',
          formNodeId: 'form',
          fieldKey: 'name',
          inputType: 'text',
          required: false,
          labelNodeId: 'field-label',
          controlNodeId: 'field-control',
        },
      ]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'field',
        property: 'label',
        value: 'Full name',
      }).changed,
    ).toBe(true);
    expect(label.get('content')).toBe('Full name');
    expect(
      JSON.parse(String(label.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE])),
    ).toEqual({
      text: 'Full name',
    });

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'field',
        property: 'type',
        value: 'radio',
      }).changed,
    ).toBe(true);
    expect(control.getAttributes()[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('input');
    expect(
      JSON.parse(String(control.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE])),
    ).toEqual(expect.objectContaining({ type: 'radio' }));
    expect(
      JSON.parse(String(root.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]))[0],
    ).toMatchObject({ inputType: 'radio' });

    bus.dispatch({
      kind: 'set-property',
      nodeId: 'field',
      property: 'options',
      value: [
        { label: 'Basic', value: 'basic' },
        { label: 'Pro', value: 'pro' },
      ],
    });
    expect(control.children).toHaveLength(1);
    expect(
      JSON.parse(String(control.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE])).options,
    ).toEqual([
      { label: 'Basic', value: 'basic' },
      { label: 'Pro', value: 'pro' },
    ]);
  });

  it('moves a field between Forms, rekeys conflicts, and rejects generic parents', () => {
    const makeField = (id: string, key: string) => {
      const label = new FakeComponent(`${id}-label`, 'label');
      label.setAttributes({
        [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
        [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ text: id }),
      });
      const control = new FakeComponent(`${id}-control`, 'input');
      control.setAttributes({
        [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
        [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
          type: 'text',
          name: key,
          fieldKey: key,
        }),
      });
      const field = new FakeComponent(id, 'form-field', [label, control]);
      field.setAttributes({
        [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
        [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
          fieldKey: key,
          required: false,
        }),
      });
      return {
        field,
        behavior: {
          id: `${id}-behavior`,
          kind: 'field',
          nodeId: id,
          formNodeId: '',
          fieldKey: key,
          inputType: 'text',
          required: false,
          labelNodeId: `${id}-label`,
          controlNodeId: `${id}-control`,
        },
      };
    };
    const moved = makeField('moved', 'email');
    const existing = makeField('existing', 'email');
    const formA = new FakeComponent('form-a', 'form', [moved.field]);
    const formB = new FakeComponent('form-b', 'form', [existing.field]);
    formA.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ formKey: 'a' }),
    });
    formB.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ formKey: 'b' }),
    });
    const section = new FakeComponent('section', 'section', [formA, formB]);
    section.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const root = new FakeComponent('root', 'root', [section]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([
        { ...moved.behavior, formNodeId: 'form-a' },
        { ...existing.behavior, formNodeId: 'form-b' },
      ]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    const move = {
      kind: 'move' as const,
      intent: { nodeId: 'moved', targetNodeId: 'form-b', position: 'inside' as const },
    };
    expect(bus.canDispatch(move)).toBe(true);
    expect(bus.dispatch(move).changed).toBe(true);
    expect(moved.field.parent()).toBe(formB);
    const behaviors = JSON.parse(
      String(root.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]),
    ) as Array<Record<string, unknown>>;
    expect(behaviors.find((behavior) => behavior.nodeId === 'moved')).toMatchObject({
      formNodeId: 'form-b',
      fieldKey: 'email-2',
    });
    expect(
      JSON.parse(
        String(moved.field.children[1]?.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE]),
      ),
    ).toMatchObject({ fieldKey: 'email-2', name: 'email-2' });

    const invalid = {
      kind: 'move' as const,
      intent: { nodeId: 'moved', targetNodeId: 'section', position: 'inside' as const },
    };
    expect(bus.canDispatch(invalid)).toBe(false);
    expect(bus.dispatch(invalid).changed).toBe(false);
    expect(moved.field.parent()).toBe(formB);
  });

  it('updates behavior metadata stored on an inserted recipe subtree', () => {
    const form = new FakeComponent('form', 'form');
    form.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ formKey: 'contact' }),
    });
    const field = new FakeComponent('field', 'form-field');
    field.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ required: true }),
    });
    form.append(field);
    const recipeRoot = new FakeComponent('recipe', 'section', [form]);
    recipeRoot.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([
        {
          id: 'field-behavior',
          kind: 'field',
          nodeId: 'field',
          formNodeId: 'form',
          fieldKey: 'email',
          inputType: 'email',
          required: true,
        },
      ]),
    });
    const root = new FakeComponent('root', 'root', [recipeRoot]);
    root.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'field',
        property: 'required',
        value: false,
      }).changed,
    ).toBe(true);
    expect(
      JSON.parse(
        recipeRoot.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE] as string,
      )[0],
    ).toMatchObject({ required: false });
  });

  it('updates Icon and Video runtime projections through live property commands', () => {
    const icon = new FakeComponent('icon', 'icon');
    icon.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ name: 'arrow-right' }),
    });
    const video = new FakeComponent('video', 'video');
    video.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ src: '/assets/video.mp4' }),
    });
    const root = new FakeComponent('root', 'root', [icon, video]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'icon',
        property: 'name',
        value: 'check',
      }).changed,
    ).toBe(true);
    expect(icon.children[0]?.getAttributes()['data-payload-icon']).toBe('check');

    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'video',
        property: 'poster',
        value: '/assets/poster-a.png',
      }).changed,
    ).toBe(true);
    expect(video.getAttributes().poster).toBe('/assets/poster-a.png');
    expect(
      bus.dispatch({
        kind: 'set-property',
        nodeId: 'video',
        property: 'poster',
        value: '',
      }).changed,
    ).toBe(true);
    expect(video.getAttributes().poster).toBeUndefined();
  });

  it('inserts before and after a target through the command bus', () => {
    const first = new FakeComponent('first', 'text');
    const second = new FakeComponent('second', 'text');
    const section = new FakeComponent('section', 'section', [first, second]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.dispatch({
        kind: 'insert',
        definition: createBlockDefinition('text'),
        targetId: 'first',
        position: 'before',
      }).changed,
    ).toBe(true);
    expect(ids(section)).toHaveLength(3);
    expect(ids(section)[1]).toBe('first');

    const insertedId = ids(section)[0]!;
    expect(
      bus.dispatch({
        kind: 'insert',
        definition: createBlockDefinition('text'),
        targetId: 'second',
        position: 'after',
      }).changed,
    ).toBe(true);
    expect(ids(section).indexOf('second')).toBe(ids(section).indexOf(insertedId) + 2);
  });

  it('rejects stale insertion targets instead of falling back to root', () => {
    const root = new FakeComponent('root', 'root');
    const editor = new FakeEditor(root);
    const command: EditorCommand = {
      kind: 'insert',
      definition: createBlockDefinition('section'),
      targetId: 'missing-target',
      position: 'after',
    };
    const bus = createEditorCommandBus(asEditor(editor));

    expect(bus.canDispatch(command)).toBe(false);
    expect(bus.dispatch(command).changed).toBe(false);
    expect(root.children).toHaveLength(0);
  });

  it('validates a command before mutating and keeps invalid targets unchanged', () => {
    const text = new FakeComponent('text', 'text');
    const root = new FakeComponent('root', 'root', [text]);
    const result = executeEditorCommand(asEditor(new FakeEditor(root)), {
      kind: 'move',
      intent: { nodeId: 'text', targetNodeId: 'text', position: 'inside' },
    });

    expect(result.changed).toBe(false);
    expect(ids(root)).toEqual(['text']);
  });

  it('repairs clone identity on the duplicate command without changing the source', () => {
    const source = new FakeComponent('text-source', 'text', [], 'Copy me');
    const section = new FakeComponent('section', 'section', [source]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    const result = bus.dispatch({ kind: 'duplicate', nodeId: 'text-source' });
    expect(result.changed).toBe(true);
    expect(section.children).toHaveLength(2);
    expect(section.children[0]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE]).toBe(
      'text-source',
    );
    expect(section.children[1]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE]).toMatch(
      /^text-/,
    );
    expect(section.children[1]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE]).not.toBe(
      'text-source',
    );
    expect(editor.getSelected()).toBe(section.children[1]);
  });

  it('duplicates a compound subtree with fresh recursive ids in one insertion', () => {
    const text = new FakeComponent('text-source', 'text');
    const container = new FakeComponent('container-source', 'container', [text]);
    const section = new FakeComponent('section-source', 'section', [container]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    const result = bus.dispatch({ kind: 'duplicate', nodeId: 'section-source' });
    const duplicate = editor.root.children[1];

    expect(result.changed).toBe(true);
    expect(duplicate).toBeDefined();
    expect(duplicate?.children[0]?.children[0]).toBeDefined();
    expect(duplicate?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE]).not.toBe(
      'section-source',
    );
    expect(duplicate?.children[0]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE]).not.toBe(
      'container-source',
    );
    expect(
      duplicate?.children[0]?.children[0]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE],
    ).not.toBe('text-source');
    expect(editor.getSelected()).toBe(duplicate);
  });

  it('prevents removing a field-owned label or control', () => {
    const label = new FakeComponent('label', 'label');
    label.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const control = new FakeComponent('control', 'input');
    control.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const field = new FakeComponent('field', 'form-field', [label, control]);
    field.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const form = new FakeComponent('form', 'form', [field]);
    form.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const root = new FakeComponent('root', 'root', [form]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([
        {
          id: 'field-behavior',
          kind: 'field',
          nodeId: 'field',
          formNodeId: 'form',
          fieldKey: 'email',
          inputType: 'email',
          required: true,
          labelNodeId: 'label',
          controlNodeId: 'control',
        },
      ]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(bus.canDispatch({ kind: 'remove', nodeId: 'label' })).toBe(false);
    expect(bus.dispatch({ kind: 'remove', nodeId: 'label' }).changed).toBe(false);
    expect(bus.canDispatch({ kind: 'remove', nodeId: 'control' })).toBe(false);
    expect(bus.dispatch({ kind: 'remove', nodeId: 'control' }).changed).toBe(false);
    expect(field.children).toHaveLength(2);

    expect(bus.dispatch({ kind: 'remove', nodeId: 'field' }).changed).toBe(true);
    expect(
      JSON.parse(root.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE] as string),
    ).toEqual([]);
  });

  it('duplicates Open Composition behaviors for a duplicated subtree', () => {
    const button = new FakeComponent('source-button', 'button');
    button.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ label: 'Toggle' }),
    });
    const section = new FakeComponent('section', 'section', [button]);
    section.setAttributes({ [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true' });
    const root = new FakeComponent('root', 'root', [section]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([
        {
          id: 'toggle-behavior',
          kind: 'action',
          nodeId: 'source-button',
          event: 'click',
          action: 'toggle',
          targetNodeId: 'source-button',
        },
      ]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(bus.dispatch({ kind: 'duplicate', nodeId: 'source-button' }).changed).toBe(
      true,
    );
    const duplicate = section.children[1];
    expect(duplicate).toBeDefined();
    const duplicateId = duplicate?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE];
    const behaviors = JSON.parse(
      root.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE] as string,
    ) as Array<Record<string, unknown>>;
    expect(behaviors).toHaveLength(2);
    expect(behaviors[1]).toMatchObject({
      nodeId: duplicateId,
      targetNodeId: duplicateId,
    });
    expect(behaviors[1]?.id).not.toBe('toggle-behavior');
  });

  it('duplicates a Form Field with a unique key and remapped control references', () => {
    const label = new FakeComponent('label-source', 'label');
    label.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ text: 'Email' }),
    });
    const control = new FakeComponent('input-source', 'input');
    control.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
        fieldKey: 'email',
        type: 'email',
        name: 'email',
      }),
    });
    const field = new FakeComponent('field-source', 'form-field', [label, control]);
    field.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
        fieldKey: 'email',
        required: true,
      }),
    });
    const form = new FakeComponent('form', 'form', [field]);
    form.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({ formKey: 'contact' }),
    });
    const root = new FakeComponent('root', 'root', [form]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([
        {
          id: 'field-source-behavior',
          kind: 'field',
          nodeId: 'field-source',
          formNodeId: 'form',
          fieldKey: 'email',
          inputType: 'email',
          required: true,
          labelNodeId: 'label-source',
          controlNodeId: 'input-source',
        },
      ]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(bus.dispatch({ kind: 'duplicate', nodeId: 'field-source' }).changed).toBe(
      true,
    );
    const duplicate = form.children[1];
    expect(duplicate).toBeDefined();
    const behaviors = JSON.parse(
      root.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE] as string,
    ) as Array<Record<string, unknown>>;
    expect(behaviors).toHaveLength(2);
    expect(behaviors[0]).toMatchObject({
      nodeId: 'field-source',
      fieldKey: 'email',
      labelNodeId: 'label-source',
      controlNodeId: 'input-source',
    });
    expect(behaviors[1]).toMatchObject({
      nodeId: duplicate?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE],
      fieldKey: 'email-2',
      labelNodeId: duplicate?.children[0]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE],
      controlNodeId: duplicate?.children[1]?.getAttributes()[BUILDER_NODE_ID_ATTRIBUTE],
    });
    expect(
      JSON.parse(
        String(duplicate?.children[1]?.getAttributes()[BUILDER_OPEN_PROPS_ATTRIBUTE]),
      ),
    ).toMatchObject({ fieldKey: 'email-2', name: 'email-2' });
  });

  it('applies a global preset inside the existing global root', () => {
    const header = new FakeComponent('header-existing', 'global-header', [
      new FakeComponent('custom-brand', 'site-brand'),
    ]);
    const root = new FakeComponent('root', 'root', [header]);
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));
    const definition = createGlobalPresetDefinition('header-brand-menu-cta');

    const result = bus.dispatch({
      kind: 'apply-global-preset',
      nodeId: 'header-existing',
      definition,
    });

    expect(result.changed).toBe(true);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(header);
    const snapshot = {
      attributes: root.getAttributes(),
      children: root.children.map((child) => ({
        attributes: child.getAttributes(),
        children: child.children.map((grandchild) => ({
          attributes: grandchild.getAttributes(),
          children: [],
        })),
      })),
    };
    assertUniquePersistedNodeIds(snapshot);
    expect(collectPersistedNodeIds(snapshot).size).toBe(5);
  });

  it('treats an unchanged responsive style as a command no-op', () => {
    const text = new FakeComponent('text', 'text');
    const root = new FakeComponent('root', 'root', [text]);
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));
    const command: EditorCommand = {
      kind: 'set-responsive-style',
      nodeId: 'text',
      property: 'width',
      value: '320px',
      viewport: 'desktop',
    };

    expect(bus.dispatch(command).changed).toBe(true);
    expect(bus.dispatch(command).changed).toBe(false);
  });

  it('updates a list property through the command bus and refreshes its preview', () => {
    const list = new FakeComponent('list', 'list');
    list.setAttributes({
      'data-payload-list-props': JSON.stringify({
        ordered: false,
        items: [{ id: 'item-1', text: 'One' }],
      }),
    });
    const section = new FakeComponent('section', 'section', [list]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    const result = bus.dispatch({
      kind: 'set-property',
      nodeId: 'list',
      property: 'ordered',
      value: true,
    });

    expect(result.changed).toBe(true);
    expect(JSON.parse(String(list.getAttributes()['data-payload-list-props']))).toEqual({
      ordered: true,
      items: [{ id: 'item-1', text: 'One' }],
    });
    expect(list.children).toHaveLength(1);
  });

  it('rejects removal of the last required compound child', () => {
    const item = new FakeComponent('item-1', 'accordion-item');
    const accordion = new FakeComponent('accordion', 'accordion', [item]);
    const section = new FakeComponent('section', 'section', [accordion]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    expect(bus.canDispatch({ kind: 'remove', nodeId: 'item-1' })).toBe(false);
    expect(bus.dispatch({ kind: 'remove', nodeId: 'item-1' }).changed).toBe(false);
    expect(accordion.children).toHaveLength(1);
    expect(
      executeEditorCommand(asEditor(editor), { kind: 'remove', nodeId: 'item-1' })
        .changed,
    ).toBe(false);
  });

  it('rejects compound add and duplicate operations at the registry maximum', () => {
    const images = Array.from(
      { length: 50 },
      (_, index) => new FakeComponent(`image-${index}`, 'image'),
    );
    const gallery = new FakeComponent('gallery', 'gallery', images);
    const section = new FakeComponent('section', 'section', [gallery]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    const insert: EditorCommand = {
      kind: 'insert',
      definition: createBlockDefinition('image'),
      parentId: 'gallery',
    };
    expect(bus.canDispatch(insert)).toBe(false);
    expect(bus.dispatch(insert).changed).toBe(false);
    expect(bus.canDispatch({ kind: 'duplicate', nodeId: 'image-0' })).toBe(false);
    expect(gallery.children).toHaveLength(50);
  });

  it('inserts a structural child through the same finite command boundary', () => {
    const accordion = new FakeComponent('accordion', 'accordion');
    const section = new FakeComponent('section', 'section', [accordion]);
    const editor = new FakeEditor(new FakeComponent('root', 'root', [section]));
    const bus = createEditorCommandBus(asEditor(editor));

    const result = bus.dispatch({
      kind: 'insert-structural-child',
      parentId: 'accordion',
      childType: 'accordion-item',
    });
    expect(result.changed).toBe(true);
    expect(accordion.children).toHaveLength(1);
    expect(accordion.children[0]?.getAttributes()[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe(
      'accordion-item',
    );
  });

  it('inserts Open Composition children through the shared structural command', () => {
    const form = new FakeComponent('form', 'form');
    form.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({
        formKey: 'contact',
      }),
    });
    const root = new FakeComponent('root', 'root', [form]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.canDispatch({
        kind: 'insert-child',
        parentId: 'form',
        slotName: '',
        childType: 'form-field',
      }),
    ).toBe(true);
    expect(
      bus.canDispatch({
        kind: 'insert-child',
        parentId: 'form',
        slotName: '',
        childType: 'input',
      }),
    ).toBe(false);
    const result = bus.dispatch({
      kind: 'insert-child',
      parentId: 'form',
      slotName: '',
      childType: 'form-field',
    });
    expect(result.changed).toBe(true);
    expect(form.children).toHaveLength(1);
    expect(form.children[0]?.children).toHaveLength(2);
    expect(
      form.children[0]?.children[0]?.getAttributes()[BUILDER_NODE_TYPE_ATTRIBUTE],
    ).toBe('label');
    expect(
      JSON.parse(
        String(form.children[0]?.getAttributes()[BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]),
      ),
    ).toEqual([expect.objectContaining({ kind: 'field', formNodeId: 'form' })]);
  });

  it('rejects Form Field insertion into generic Open Composition containers', () => {
    const section = new FakeComponent('section', 'section');
    section.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_PROPS_ATTRIBUTE]: JSON.stringify({}),
    });
    const root = new FakeComponent('root', 'root', [section]);
    root.setAttributes({
      [BUILDER_OPEN_COMPOSITION_ATTRIBUTE]: 'true',
      [BUILDER_OPEN_BEHAVIORS_ATTRIBUTE]: JSON.stringify([]),
    });
    const editor = new FakeEditor(root);
    const bus = createEditorCommandBus(asEditor(editor));

    expect(
      bus.canDispatch({
        kind: 'insert-child',
        parentId: 'section',
        slotName: '',
        childType: 'form-field',
      }),
    ).toBe(false);
    expect(
      bus.dispatch({
        kind: 'insert-child',
        parentId: 'section',
        slotName: '',
        childType: 'form-field',
      }).changed,
    ).toBe(false);
    expect(section.children).toHaveLength(0);
  });
});
