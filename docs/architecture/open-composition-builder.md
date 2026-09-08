# Open Composition Builder Architecture

The builder stores a visual tree and a behavior list in one versioned V8 page
payload:

```text
PagePayloadV8
├── metadata
├── root: OpenCompositionNode
└── behaviors: OpenCompositionBehavior[]
```

Every persisted visual node has a stable ID, a registry type, free-form but
bounded props, optional responsive style blocks, and real children. A node's
allowed children and behavior capabilities come from
`OPEN_COMPOSITION_REGISTRY`; the builder and contract validator use the same
model.

GrapesJS receives editor metadata only as `data-payload-open-*` attributes.
Those attributes are stripped from canonical props by the adapter. The root
stores the current behavior list, while a newly inserted recipe may carry its
detached behavior list on its subtree until the next serialize operation.

The renderer does not import builder modules. It has an explicit V8 renderer
that maps layout and semantic nodes to HTML, resolves safe styles/tokens, and
keeps field/action behavior runtime state in a client boundary.
