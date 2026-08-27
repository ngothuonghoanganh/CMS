# 03 — Target Architecture

## 1. Architectural objective

The target architecture should make feature addition safe and localized while keeping the visual editor, public renderer, and persistence model consistent.

The desired dependency direction is conceptualized as:

```text
Domain contracts / shared schemas
        ↓
API + persistence services
        ↓
CMS application        Renderer application
        ↓                       ↓
Editor Core ───── Component Registry ───── Rendering runtime
```

Avoid circular ownership where UI state becomes an alternative domain model.

## 2. Recommended major modules

Exact paths may differ after source audit, but responsibilities should converge toward these modules/packages.

### `domain` / `contracts`

Owns:

- IDs and domain primitives;
- PageDocument schema;
- component-node types;
- page status/version contracts;
- form/submission contracts;
- API DTOs where genuinely shared;
- validation schemas;
- contract versioning.

Must not depend on React or browser UI libraries.

### `component-registry`

Owns component definitions:

```ts
interface ComponentDefinition {
  type: string;
  version: number;
  label: string;
  category: string;
  icon?: unknown;
  defaultProps: Record<string, unknown>;
  slots?: SlotDefinition[];
  allowedParents?: string[];
  allowedChildren?: string[];
  propertiesSchema: PropertyDefinition[];
  styleSchema?: StyleDefinition[];
  migrate?: (node: unknown, fromVersion: number) => unknown;
}
```

Renderer-specific React implementations may be mapped separately if sharing React code is undesirable, but type/props contracts must originate from one definition source.

### `editor-core`

Owns:

- current PageDocument;
- selection;
- commands;
- history/undo/redo;
- dirty state;
- revision state;
- validation;
- derived document tree queries.

Editor Core should not depend on a particular screen layout.

### `cms-ui` / design-system package

Owns reusable application primitives. Feature code should compose these primitives rather than recreating them.

### `renderer`

Consumes published PageDocument and registry contracts. Must render deterministic output and fail visibly/diagnostically for unsupported or invalid nodes.

### tenant resolution layer

Owns master DB lookup, tenant DB lifecycle/cache, context propagation, and strict tenant boundary enforcement.

## 3. Data-flow principles

### Initial editor load

```text
Route page id
  → fetch page metadata + draft document
  → validate/migrate document
  → initialize Editor Core once
  → Canvas/Layers/Inspector render derived views
```

### Edit

```text
User interaction
  → command
  → validate mutation
  → update canonical PageDocument
  → history entry
  → dirty=true
  → subscribed views update
```

### Save

```text
dirty document
  → debounced/manual save queue
  → PATCH expectedRevision + document
  → server validates
  → server increments revision
  → client accepts acknowledgement
  → dirty=false only if no newer local command exists
```

### Publish

Publishing should create or mark a stable public snapshot/version. Public rendering should not depend on partially saved local editor state.

## 4. Separation of server state and editor state

TanStack Query or another server-state library should manage fetched entities and request lifecycle, but should **not be the live editable PageDocument store**.

Once a page draft is loaded into Editor Core, normal keystrokes and drag commands should not mutate query cache as the primary editor mechanism.

## 5. Event-driven preview

For an iframe-based preview:

```text
Editor Core document change
 → serialize safe preview message
 → postMessage / editor bridge
 → preview runtime applies new document
```

Do not continuously GET the page to reflect local unsaved edits.

## 6. Error boundaries and observability

Critical subsystems should expose diagnostics:

- unsupported component type;
- schema validation failure;
- document migration failure;
- tenant resolution failure;
- save revision conflict;
- integration execution error;
- public render failure.

Development mode should prefer explicit failures over silently dropping nodes.

## 7. Versioning

PageDocument and components should be versioned deliberately.

At minimum:

```ts
interface PageDocument {
  schemaVersion: number;
  root: ComponentNode;
}
```

Each node may additionally contain its component schema version if component migrations evolve independently.

Do not rely on "current code knows old JSON" indefinitely.
