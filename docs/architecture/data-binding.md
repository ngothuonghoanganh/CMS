# Data Binding

Bindings are serializable composition records connecting a bindable component
property to a finite data source. The node keeps its normal property and the
binding owns the dynamic source, so editor state is not an executable template.

```ts
{
  id,
  targetNodeId,
  targetProperty: 'text',
  source: {
    type: 'query-item',
    sourceId: queryId,
    path: 'name'
  },
  fallback: 'Product'
}
```

Supported source types are `static`, `variable`, `query`, `query-item`, and
`current-entry`. Paths are intentionally restricted to safe dot-separated
field keys. The shared runtime resolver supports scalar values and the finite
`{value}` URL/text template; it does not evaluate formulas, JavaScript, or
arbitrary expressions.

The component registry marks the initial safe property set as bindable:
text/heading/link/quote content, image source and alt text, and button label and
href. The CMS Inspector exposes Static/Dynamic mode, source, field path,
fallback, and Disconnect. Binding changes and query changes are included in
the canonical `PageComposition`, survive save/reload, are remapped when nodes
are duplicated, and are removed when their target node is removed.

## Runtime context

```text
PageComposition queries
  -> bounded resolved queryItems
  -> DataContext { currentEntry, queryItems, variables }
  -> resolveBinding
  -> registered component property
  -> SSR renderer
```

Collection List sets `currentEntry` while rendering its one item template.
Dynamic pages set `currentEntry` to the matched published entry. The same
shared resolver is used for preview and renderer paths; only the data snapshot
differs.

Reusable/template cloning remaps binding IDs, query IDs, source IDs, and target
node IDs. A binding whose field or source is missing is rejected during publish
rather than silently producing incorrect public content.
