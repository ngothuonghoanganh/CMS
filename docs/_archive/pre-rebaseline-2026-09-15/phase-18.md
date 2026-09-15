# Phase 18 — Reusable Sections, Symbols, and Site Design System

Phase 18 adds three site-scoped capabilities while preserving the existing
PagePayload, SiteGlobals, GrapesJS, command-boundary, component-registry, and
UndoManager contracts.

## Reusable sections

Reusable definitions live in the `reusables` domain and are owned by one
workspace and site. A definition stores a validated `ReusableComponentDocument`
containing one normal section/component subtree. It cannot contain globals,
nested reusable instances, or editor-only preview nodes.

Builder behavior is deliberately explicit:

- Copy inserts a fresh-ID subtree and then has no relationship with the source.
- Linked inserts a `reusable-instance` leaf containing only `reusableId`.
- The linked source is shown in Canvas through non-persisted preview descendants.
- Detach replaces the leaf with a fresh-ID copy of the current source in one
  GrapesJS history group.

Archiving removes a reusable from the active Saved library but does not break
existing instances. Public rendering continues from the last published source
snapshot. A site publish rejects an archived referenced source that has no
published snapshot. Usage is computed across current page drafts, globals, and
reusable documents.

## Draft and published sources

Reusable edits are saved to `draft`. Site publish snapshots the draft of every
active reusable referenced by a published page. The public resolver only
returns `published` reusable documents, while Builder preview resolves drafts.
Dependency resolution uses one `$in` query for all reusable IDs in a payload.

## PagePayloadV7 and tokens

V1–V6 remain unchanged. V7 extends responsive style values with the finite
reference shape:

```ts
{ kind: 'token', tokenId: 'color-primary' }
```

Literal strings remain valid. The shared contract helper
`resolvePageStyleValue` applies the same resolution in Builder and renderer.
Responsive precedence remains base → tablet → mobile. Reusable definitions
resolve token IDs against the owning site design system; tokens are not copied
into the reusable.

The site design system contains finite Colors, Typography, Spacing, Radius,
Shadows, and Container Widths groups. Token IDs are stable and globally unique
within the site. The CMS supports editing, adding, duplicating, and removing
tokens. The API rejects removal of a token still used by pages, globals, or
reusables, and rejects publish when a referenced token is missing. Existing
sites without a design system fall back to literals/defaults. Draft and
published design systems are separate; public rendering never reads a mutable
draft.

## Builder library and templates

The Add library has `Layouts`, `Elements`, `Saved`, and `Templates` tabs. Saved
cards are user-owned reusable definitions with copy/link/edit-source actions. Built-in
templates are metadata plus previews derived from normal component definitions;
template insertion goes through the existing block/command/identity path and
does not persist a template semantic node.

## Scope exclusions

Nested reusable sources, cross-site sharing, variant/property overrides,
version pinning, marketplace distribution, slider/carousel/modal components,
CMS collections, dynamic data binding, custom HTML/JS/iframe, AI generation,
collaboration, and autosave remain out of scope.
