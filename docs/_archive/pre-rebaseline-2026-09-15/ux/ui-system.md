# CMS UI system

## Scope

This is a small, CSS-backed system for the current Next.js CMS. It does not add
a component framework, change API contracts or add a PagePayload field. Native
controls remain the semantic foundation, while the Builder inspector is driven
by the shared component property registry.

The source lives in `apps/cms/app/ui`:

- `fields.tsx` owns reusable field and inspector controls.
- `field-utils.ts` owns parsing, formatting and validation that can be unit
  tested without a browser.
- `surfaces.tsx` owns shared overlays, data tables, pagination and resource
  loading/empty/error states.
- `system.css` owns the compact/default control scale and field layout.

Import only the control that matches the domain value; do not recreate a new
per-page visual wrapper for it.

## Field anatomy and states

Every regular field is composed of a visible label, one semantic native
control, optional help text, and an inline error. Controls support focus-visible,
disabled, read-only (when the native control supports it), compact and default
density. Builder inspector fields use compact density; resource forms use the
default density.

Use a field label instead of a placeholder as the name of a value. A placeholder
is optional example text only. Icon/button controls need a distinct accessible
name, while the editable input retains the field label.

## Control selection

| Data or interaction                           | Use                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Short text, email, phone, URL                 | `TextField` with the matching native `type`                                               |
| Long text                                     | `TextAreaField`                                                                           |
| Bounded numeric value                         | `NumberField` with `min`, `max`, `step`, and stepper buttons                              |
| CSS dimension supported by PagePayload        | `UnitField`                                                                               |
| Padding or margin                             | `SpacingControl` with linked/unlinked sides                                               |
| Small enum                                    | `SegmentedControl` or radios when all choices should remain visible                       |
| Larger enum                                   | `SelectField`; use a searchable combobox only after an actual large/remote dataset exists |
| Boolean that takes effect immediately         | A labelled switch/toggle; use checkbox only for selection or form answers                 |
| Hex color currently supported by the renderer | `ColorField` (native picker, editable HEX, clear)                                         |
| Required date/time stored as an instant       | `DateTimeField`; describe any timezone conversion next to it                              |

Do not use raw text fields for normal dimensions, colors, numeric values or date
time values. A legacy CSS expression that the constrained `UnitField` cannot
represent is shown as preserved custom data until the author changes it; no
existing PagePayload style is silently discarded.

## Builder inspector

The Builder is contextual: render only fields the selected PagePayload node and
the frozen `PageNodeStyle` contract support. Its standard order is Content,
Layout, Spacing, Typography, Appearance, and Advanced. Unsupported groups such
as shadows, gradients, arbitrary positioning, or responsive overrides beyond
the existing desktop/tablet/mobile style blocks must not be simulated.

The inspector follows these persistence rules:

1. A field change updates the GrapesJS canvas immediately.
2. The builder remains `Unsaved` until the author explicitly saves.
3. Saving serializes the existing validated PagePayload and handles the existing
   version conflict state.

This prevents slider/picker/input events from becoming API requests. The
desktop/tablet/mobile selector continues to edit the existing style blocks; the
current viewport is displayed in the inspector header.

Phase 13 contribution metadata currently provides extension property keys, not
a typed property-editor schema. Standard controls are reused for built-in
PagePayload fields only. Add a typed extension property control only through the
existing contribution contracts when a concrete extension requires it; do not
introduce arbitrary extension UI or executable configuration.

## Resource forms and CRUD surfaces

Choose the surface by task complexity:

| Task                                                             | Surface                              |
| ---------------------------------------------------------------- | ------------------------------------ |
| Destructive confirmation with impact                             | Alert dialog                         |
| One focused create/edit task with a few fields                   | Modal                                |
| View or edit secondary details without losing list context       | Drawer                               |
| Object with many sections, permissions, mapping, or rich content | Dedicated page or full-screen editor |
| Small contextual choice such as color or date                    | Popover                              |

Forms with more than five inputs are grouped into named sections. Validation is
specific and next to the relevant field; a toast or banner complements rather
than replaces it. Save feedback has one owner: inline state, a toast, or dialog
closure plus list refresh, not all three.

## Tables, navigation, overlays, and responsive ownership

- Use `DataTable` from `ui/surfaces.tsx`, which provides the existing
  `table-shell`/`data-table` surface. Wide datasets scroll inside that surface,
  never on the page body. Use `PaginationControls` for server-backed paging and
  add sorting or filtering only when the backing endpoint implements it.
- Empty states name the empty resource and the permitted next action. Loading is
  local to the affected surface; use `EmptyState`, `LoadingState` and
  `ErrorState` for consistent semantics. Do not blank the entire CMS for a row
  mutation.
- Company remains read-only in the header. Workspace remains the only context
  switcher. The permission-aware sidebar remains compact on desktop and is an
  off-canvas, focus-contained overlay at tablet/mobile widths.
- Modal, drawer, popover, tooltip and combobox behavior must use a single
  overlay policy: portal/layer order, Escape, outside click, focus restoration
  and intentional scroll ownership. Do not add a custom overlay implementation
  to an individual resource screen.

## Review checklist

Before merging a CMS UI change, verify:

1. The control maps to a real domain capability and preserves the existing API
   and PagePayload contract.
2. A label, keyboard path, visible focus state and error association exist.
3. Loading, empty, failure and success feedback match the scope of the action.
4. Tables and Builder canvas own any horizontal scrolling locally.
5. The view works at 1440, 1280, 1024, 768 and 390 pixels, including the
   Builder inspector's mobile composition.
6. Effects do not create duplicate requests or save on every keystroke.

## Design references

The system takes behavior and information-architecture principles, not visual
layouts, from the official [Figma properties panel guide](https://help.figma.com/hc/en-us/articles/360039832014-Design-Prototype-and-view-Code-in-the-Properties-Panel), [WordPress block inspector guidance](https://developer.wordpress.org/block-editor/getting-started/fundamentals/block-in-the-editor/), [Shopify form guidance](https://shopify.dev/docs/apps/design/user-experience/forms), and [Atlassian component guidance](https://atlassian.design/components). Pinterest research was used only for density, hierarchy and grouping inspiration.
