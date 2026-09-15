# Legacy Component Migration

V1–V7 payloads remain readable and immutable. A legacy page stays in its
original format while it is only being viewed or edited. When an Open
Composition recipe is inserted, the current legacy draft is migrated to V8 at
that feature boundary before the new nodes are appended. The migration is
deterministic and source-preserving:

```text
V7 Form { fields[] }
        ↓
V8 Form
  ├── Form Field → Label + Input/Textarea/Select
  └── Button + action(submit-form → Form)
```

Other legacy nodes are copied into the Open Composition graph and their safe
styles/props are retained. If migration encounters an unsupported node or an
invalid semantic graph, validation fails at the boundary rather than silently
publishing a partial document. Existing public V1–V7 versions continue through
the legacy renderer and submission path.
