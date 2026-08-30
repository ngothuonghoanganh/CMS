import { describe, expect, it } from 'vitest';

import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
} from './builder-adapter';
import {
  moveNodeByIntent,
  resolveNodePlacement,
  type MoveNodeIntent,
} from './builder-placement';

class FakeComponent {
  private parentNode: FakeComponent | undefined;
  readonly children: FakeComponent[] = [];
  readonly attrs: Record<string, string>;

  constructor(id: string, type: string, children: FakeComponent[] = []) {
    this.attrs = {
      [BUILDER_NODE_ID_ATTRIBUTE]: id,
      [BUILDER_NODE_TYPE_ATTRIBUTE]: type,
    };
    children.forEach((child) => this.append(child));
  }

  append(child: FakeComponent): void {
    child.parentNode = this;
    this.children.push(child);
  }

  getAttributes(): Record<string, string> {
    return this.attrs;
  }

  parent(): FakeComponent | undefined {
    return this.parentNode;
  }

  index(): number {
    return this.parentNode?.children.indexOf(this) ?? -1;
  }

  components(): { models: FakeComponent[] } {
    return { models: this.children };
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
    // Mirror GrapesJS' collection move semantics: `at` is evaluated against
    // the collection before the source is removed.
    const index = Math.min(
      Math.max(
        sourceParent === destination && sourceIndex < requestedIndex
          ? requestedIndex - 1
          : requestedIndex,
        0,
      ),
      destination.children.length,
    );
    this.parentNode = destination;
    destination.children.splice(index, 0, this);
  }
}

const asComponent = (component: FakeComponent) => component as never;

function fixture() {
  const textA = new FakeComponent('text-a', 'text');
  const textB = new FakeComponent('text-b', 'text');
  const containerA = new FakeComponent('container-a', 'container', [textA]);
  const containerB = new FakeComponent('container-b', 'container', [textB]);
  const section = new FakeComponent('section', 'section', [containerA, containerB]);
  return {
    root: new FakeComponent('root', 'root', [section]),
    section,
    containerA,
    containerB,
    textA,
    textB,
  };
}

function intent(
  nodeId: string,
  targetNodeId: string,
  position: MoveNodeIntent['position'],
): MoveNodeIntent {
  return { nodeId, targetNodeId, position };
}

describe('builder placement engine', () => {
  it('moves siblings after the intended target without index shifting', () => {
    const first = new FakeComponent('first', 'text');
    const second = new FakeComponent('second', 'text');
    const third = new FakeComponent('third', 'text');
    const parent = new FakeComponent('parent', 'container', [first, second, third]);
    const root = new FakeComponent('root', 'root', [parent]);

    expect(
      moveNodeByIntent(asComponent(root), intent('first', 'second', 'after')).valid,
    ).toBe(true);
    expect(parent.children.map((node) => node.attrs[BUILDER_NODE_ID_ATTRIBUTE])).toEqual([
      'second',
      'first',
      'third',
    ]);
  });

  it('supports cross-parent reparenting when the registry permits it', () => {
    const { root, containerA, containerB } = fixture();
    const result = moveNodeByIntent(
      asComponent(root),
      intent('text-a', 'container-b', 'inside'),
    );

    expect(result.valid).toBe(true);
    expect(containerA.children).toHaveLength(0);
    expect(
      containerB.children.map((node) => node.attrs[BUILDER_NODE_ID_ATTRIBUTE]),
    ).toEqual(['text-b', 'text-a']);
  });

  it('rejects invalid parent relationships before mutation', () => {
    const { root, textA, textB } = fixture();
    const result = resolveNodePlacement(
      asComponent(root),
      intent('text-a', 'text-b', 'inside'),
    );

    expect(result).toEqual({ valid: false, reason: 'text cannot contain text.' });
    expect(textA.parent()).not.toBe(textB);
  });

  it('rejects moving an ancestor into its descendant', () => {
    const { root, section, containerA } = fixture();
    const result = resolveNodePlacement(
      asComponent(root),
      intent('section', 'container-a', 'inside'),
    );

    expect(result).toEqual({
      valid: false,
      reason: 'A node cannot be moved into its own descendant.',
    });
    expect(section.parent()).toBe(root);
    expect(containerA.parent()).toBe(section);
  });
});
