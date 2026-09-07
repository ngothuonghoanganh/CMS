# Design System V2

Design System V2 separates a website's brand foundation from page composition.
Built-in blocks describe semantic intent and structure; the effective Design
System supplies their appearance.

## Resolution model

The effective system is assembled as:

```text
workspace published styles
  < site published sparse override
  < semantic component recipe
  < node local style
  < node responsive local style
```

`mergeSiteDesignSystems` is the canonical workspace/site merge. Site overrides
remain sparse, so “Use workspace style” clears the site-owned delta instead of
copying a second full system.

`resolveDesignSystemAppearance` resolves a component using its type, semantic
props, optional variant, part, and viewport. The resolver understands:

- `heading-1` through `heading-6`, selected by `heading.props.level`;
- `text`, `text-small`, and `text-muted`, selected by `text.props.role`;
- `button-primary`, `button-secondary`, and `button-ghost`, selected by
  `button.props.variant`;
- compound component `partsStyle` and `base`/`tablet`/`mobile` recipe values.

Builder and Renderer resolve the recipe first and merge node-local values
afterward. A reset removes the authored local property; it never copies the
current Design System value into the page node.

## Semantic colors and foundations

`semanticRoles` provides stable role-to-token IDs. The UI uses labels such as
Page background, Primary, Text, and Border; it never infers roles from token
names. Required roles are reserved in the default system and can point at a
custom color token without changing the role vocabulary.

The Page/root recipe owns page background, page text, body font, and minimum
height. Section and Container recipes are transparent by default. Surface is
reserved for cards, forms, panels, and secondary surfaces.

The public page shell applies Page background to the outer website wrapper and
the page content wrapper. The Builder paints the same surface onto the GrapesJS
iframe body as an editor-only presentation value; it is not serialized into
every section.

## Preset authoring

Built-in presets define composition and semantic intent, not brand styling.

Good:

```text
Heading level=1
Button variant=primary
Container display=flex / flex-direction=column
```

Bad:

```text
font-size: 48px
background: #2563eb
button padding: 12px 18px
```

Use `structuralStyle` only for layout relationships. If a future preset needs
design-related spacing, author a validated token reference through the payload
adapter rather than a `var(...)` string or a literal theme value. Built-in
templates reuse the same preset registry and therefore inherit these rules.

Known pre-V2 Hero, CTA, and Header signatures are normalized at the Builder
serialization boundary. The normalizer is idempotent, removes only exact
system-generated values, and preserves unrelated user-authored properties.
Partially matching or arbitrary styles are left unchanged.

## Registry and editor

`PAGE_COMPONENT_REGISTRY` is the source of truth for Design System exposure:
category, label, variants, parts, and supported style controls. Adding a
themeable component requires registry metadata, renderer support, and Builder
projection/part support. The Design System editor derives its component list
and controls from this metadata. Form recipes include field, label, input,
option, submit, error, and success parts so actual controls inherit the same
surface, typography, border, spacing, and semantic color tokens.

The editor is a docked desktop workbench: the live website preview is the
dominant column and the editor is a 380–420px right column. Color and
typography foundations are compact rows with selected detail. Component
recipes expose responsive Desktop, Tablet, and Mobile detail without showing
raw token IDs in the normal flow. Save draft and Publish styles stay available
in the sticky editor toolbar.

## Publish safety

Workspace and site draft systems are used by authoring and draft preview.
Public page resolution reads the published workspace system plus the published
site sparse override. Direct site style publishing continues to persist the
sparse override and its published snapshot, independently from whole-site page
publishing.

Interaction states such as hover/focus are not represented unless the style
contract and renderer support them. The editor exposes only finite registry
controls and never evaluates user JavaScript or arbitrary expressions.
