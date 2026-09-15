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

## Authoring UX boundary

Open Composition authoring metadata is defined next to the shared V8 registry
in `packages/contracts/src/open-composition.ts`. The metadata names the
properties a normal user can edit, provides friendly labels and semantic
controls, and groups style properties for progressive disclosure. The CMS
Inspector consumes this registry through the existing `PropertyControlRenderer`
used by legacy components; it does not infer the primary authoring UI from
runtime prop types.

The Layers tree represents the persisted visual/content tree. It does not add
duplicate pseudo-nodes for legacy-style parts. A composable V8 Form exposes
its Label, Input, Field, and Submit nodes directly, while `partsStyle` remains
an explicitly supported compatibility representation in adapter serialization
and renderer output. This keeps style targeting understandable and preserves
old payloads.

Open insertion, quick add, and Inspector structure actions pass through the
same registry-backed command validation. Responsive Inspector values resolve
from the current viewport and show inherited values or a reset action when an
override exists.
