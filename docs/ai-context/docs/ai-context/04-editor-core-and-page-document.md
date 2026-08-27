# 04 — Editor Core and PageDocument

## 1. Core invariant

There is exactly one authoritative editable page representation at a time: **PageDocument**.

Canvas, Layers, Inspector, breadcrumbs, history, save, and preview must not maintain independent structural copies.

## 2. Suggested document shape

The exact schema must be reconciled with existing contracts. Conceptually:

```ts
interface PageDocument {
  schemaVersion: number;
  rootId: string;
  nodes: Record<string, ComponentNode>;
  metadata?: Record<string, unknown>;
}

interface ComponentNode {
  id: string;
  type: string;
  componentVersion: number;
  props: Record<string, unknown>;
  styles?: ResponsiveStyleValue;
  children?: string[];
}
```

A normalized node map is useful for editor operations, but a nested tree may remain appropriate if current contracts strongly favor it. Do not migrate representation without measuring compatibility cost.

The invariant matters more than the exact shape.

## 3. Commands

All structural/property changes should be modeled as explicit commands, for example:

```ts
insertNode(input);
moveNode(input);
reparentNode(input);
removeNode(input);
duplicateNode(input);
updateProps(input);
updateStyle(input);
updateBinding(input);
renameNode(input);
```

Commands should:

1. validate preconditions;
2. enforce registry parent/child rules;
3. mutate/produce a new canonical document state;
4. create an undoable history record;
5. mark document dirty;
6. emit one coherent state change.

## 4. Shared move/reparent semantics

Canvas and Layers must call the same structural command.

Represent drop intent explicitly:

```ts
type DropPosition = 'before' | 'inside' | 'after';
```

Validation:

```ts
canDrop({ draggedId, targetId, position, document, registry });
```

The visual layer may differ, but business semantics must not.

## 5. Selection model

Selection should be separate from PageDocument persistence:

- selected node id;
- hovered node id;
- active panel;
- canvas viewport/zoom;
- expanded layer ids.

These are editor-session concerns and generally should not be serialized into the public page document.

## 6. Undo/redo

Undo/redo must cover structural and property mutations consistently.

If GrapesJS remains the authoritative editor engine, integrate with its UndoManager rather than creating a conflicting second history model. If PageDocument becomes authoritative outside GrapesJS, choose one history owner and adapt the UI to it.

Never maintain two independent undo stacks for the same mutation stream.

## 7. Dirty and save state

Recommended state:

- `serverRevision`;
- `localRevision` or mutation sequence;
- `dirty`;
- `saving`;
- `lastSavedAt`;
- `saveError`;
- `conflict`.

A save response for an older local revision must not incorrectly mark a newer edited document clean.

## 8. Autosave

Autosave may be debounced, but must be command/dirty driven rather than render/effect driven.

Bad pattern:

```text
React render → effect sees object changed → PATCH → refetch → replace object → effect → PATCH
```

Preferred:

```text
Editor command → dirty event → save scheduler → PATCH once
```

## 9. Inspector binding

Inspector fields should read values through Editor Core selectors and write through commands.

Avoid persistent local form copies for ordinary immediate-edit fields. When a complex modal needs draft form state, make commit/cancel semantics explicit.

## 10. Property schema

Suggested property definition:

```ts
interface PropertyDefinition {
  key: string;
  label: string;
  group:
    | 'content'
    | 'layout'
    | 'typography'
    | 'background'
    | 'border'
    | 'effects'
    | 'advanced';
  control: PropertyControlType;
  defaultValue?: unknown;
  required?: boolean;
  responsive?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: unknown }>;
  visibleWhen?: PropertyCondition;
  validate?: unknown;
  help?: string;
}
```

This schema should drive consistent UI controls and validation.

## 11. GrapesJS integration decision

A deep source audit must establish one of these models explicitly:

### Model A — GrapesJS authoritative

GrapesJS project/component state is canonical while application adapters convert to versioned PageDocument for persistence/renderer.

### Model B — PageDocument authoritative

Application Editor Core owns canonical state and GrapesJS acts as a rendering/interaction adapter.

Do not accidentally operate a Model C where both are independently authoritative.
