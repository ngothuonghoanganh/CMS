# PagePayload V1 — Frozen Contract

## Purpose

`PagePayloadV1` is the canonical, JSON-safe representation of a landing page. It is
the boundary between the builder adapter, the API, persistence and the renderer. The
editor is an implementation detail: GrapesJS editor state is transient and no raw
editor project JSON is persisted.

## Shape

```text
PagePayloadV1
├── version: 1
├── metadata
│   ├── documentTitle
│   └── documentDescription?
└── root: PageNode
    ├── id
    ├── type
    ├── props
    ├── style?
    └── children
```

The V1 node set is deliberately small: `root`, `section`, `container`, `text`,
`image`, and `button`. Container nodes may contain layout/content nodes; leaf nodes
cannot contain children. Each node has a stable, page-local `id`. The root id is always
`root`, and all ids must be unique in the tree. `type` is the only node discriminator;
there is no duplicated `props.kind` field.

`LandingPage.name` is the CMS management name. `metadata.documentTitle` and
`metadata.documentDescription` are versioned rendered document metadata and are not a
second source of truth for the management name.

Styles are serializable design values grouped into `base`, with optional `tablet` and
`mobile` overrides. The allowed style properties are explicit rather than an arbitrary
CSS object. This keeps the contract deterministic while leaving a clear extension path
for responsive rendering.

## Validation and serialization

The Zod schemas are the runtime source of truth. Objects are strict at every contract
boundary, so unknown fields are rejected rather than silently persisted. Validation
checks the version discriminator, child compatibility, root invariants, duplicate ids,
node count, tree depth, text lengths, style lengths and URL policy. The contract limits
serialized payloads to 256 KiB, 200 nodes and a depth of 24.

Button URLs allow `http`, `https`, relative paths, anchors, `mailto` and `tel`. Image
sources allow `http`, `https` and `/assets/` paths. Unsafe schemes such as `javascript`,
`vbscript` and `data` are rejected.

`parsePagePayload` validates unknown input. `serializePagePayload` validates then calls
`JSON.stringify`; `deserializePagePayload` parses JSON and validates again. Payloads do
not contain dates, maps, sets, functions, class instances, browser objects or database
types.

## Versioning and evolution

Persisted payloads use a literal numeric discriminator (`version: 1`). The public
`PagePayloadSchema` is a discriminated union, currently containing only V1. A future V2
can be added as a new schema and union member without changing V1 data or making the
persisted value depend on a `latest` alias. Migration tooling is intentionally deferred
until a real V2 exists.

## Example

```json
{
  "version": 1,
  "metadata": {
    "documentTitle": "Launch your next idea",
    "documentDescription": "A focused landing page."
  },
  "root": {
    "id": "root",
    "type": "root",
    "props": {},
    "children": [
      {
        "id": "hero",
        "type": "section",
        "props": {},
        "style": {
          "base": { "padding": "64px 24px", "backgroundColor": "#111827" }
        },
        "children": [
          {
            "id": "hero-copy",
            "type": "container",
            "props": {},
            "children": [
              {
                "id": "headline",
                "type": "text",
                "props": { "text": "Ship faster" },
                "children": []
              },
              {
                "id": "cta",
                "type": "button",
                "props": {
                  "label": "Start now",
                  "href": "https://example.com/start",
                  "target": "_self"
                },
                "children": []
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Trade-offs and limitations

- Explicit node unions are more verbose than an opaque `Record<string, unknown>`, but
  they provide meaningful validation and prevent an editor's internal model from
  becoming a hidden domain API.
- The style vocabulary is intentionally incomplete. It is a stable starting contract,
  not a CSS engine.
- PagePayloadV1 is frozen. Compatible bug fixes are allowed, but incompatible semantics
  require a new numeric discriminator such as PagePayloadV2.
- There is no animation engine, form model, feature registry, or HTML/CSS canonical
  blob in V1. Phase 4 supports only the explicit node/style vocabulary through its
  adapter; unsupported editor data must fail or remain outside the persisted payload.
