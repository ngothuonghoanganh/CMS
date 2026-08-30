import { describe, expect, it } from 'vitest';

import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  createBlockDefinition,
} from './builder-adapter';
import {
  createEditorCommandBus,
  executeEditorCommand,
  type EditorCommand,
} from './editor-commands';

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
    const child =
      definition instanceof FakeComponent
        ? definition
        : new FakeComponent(
            String(
              (definition.attributes as Record<string, unknown>)[
                BUILDER_NODE_ID_ATTRIBUTE
              ],
            ),
            String(
              (definition.attributes as Record<string, unknown>)[
                BUILDER_NODE_TYPE_ATTRIBUTE
              ],
            ),
            [],
            String(definition.content ?? ''),
          );
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
    if (command === 'tlb-clone' && this.selected) {
      const source = this.selected;
      const parent = source.parent();
      if (!parent) return;
      const attributes = source.getAttributes();
      const clone = new FakeComponent(
        String(attributes[BUILDER_NODE_ID_ATTRIBUTE]),
        String(attributes[BUILDER_NODE_TYPE_ATTRIBUTE]),
        [],
        String(source.get('content') ?? ''),
      );
      parent.append(clone, { at: source.index() + 1 });
      this.selected = clone;
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
      /^copy-/,
    );
    expect(editor.getSelected()).toBe(section.children[1]);
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
});
