# CMS Admin Design System

The CMS Admin Design System is the visual and interaction foundation for the
Payload CMS application. It is intentionally separate from `SiteDesignSystem`,
which describes customer-facing website output. CMS Admin tokens must not be
derived from tenant content or copied into public renderer data.

## Goals

- Make collection and resource-management screens feel like one product.
- Keep information density high without sacrificing readability or keyboard use.
- Give every feature a small set of predictable, composable primitives.
- Support dark, light, and system themes without changing business behavior.
- Keep tenant isolation, permissions, routes, persistence, and builder data
  contracts unchanged.

The default theme is dark because the CMS is optimized for long admin sessions
and the Collection screen is the visual baseline. Light and system preferences
are available from the account header and persist in local storage.

## Architecture

| Layer                  | Location                          | Responsibility                                                              |
| ---------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| Semantic tokens        | `apps/cms/app/ui/tokens.css`      | Color roles, spacing, type, radius, elevation, motion, breakpoints          |
| Shared primitives      | `apps/cms/app/ui/primitives.tsx`  | Buttons, panels, badges, alerts, tabs, search, layout helpers               |
| Form primitives        | `apps/cms/app/ui/fields.tsx`      | Labels, inputs, select, date/time, color, checkbox, switch, radio, combobox |
| Surfaces               | `apps/cms/app/ui/surfaces.tsx`    | Modal/dialog, drawer/sheet, table, page headers, loading/empty/error states |
| Icon abstraction       | `apps/cms/app/ui/icons.tsx`       | Consistent inline SVG icons for shell navigation and controls               |
| Shared behavior/styles | `apps/cms/app/ui/system.css`      | Primitive states, focus, responsive rules, compatibility styles             |
| Third-party isolation  | `apps/cms/app/ui/third-party.css` | Editor/vendor styles that must not define CMS chrome                        |

Feature styles remain local to their screens while reusable visual decisions
belong in the UI layer. `globals.css` should contain only app-wide reset,
layout, shell, and feature composition; new primitives and token definitions
belong in `app/ui`.

## Token rules

Use semantic roles instead of literal colors:

| Role                | Examples                                                           |
| ------------------- | ------------------------------------------------------------------ |
| Canvas and surfaces | `--cms-bg-canvas`, `--cms-bg-surface`, `--cms-bg-surface-raised`   |
| Text                | `--cms-text-primary`, `--cms-text-secondary`, `--cms-text-muted`   |
| Borders             | `--cms-border-subtle`, `--cms-border-strong`, `--cms-border-focus` |
| Actions             | `--cms-primary`, `--cms-primary-hover`, `--cms-primary-foreground` |
| Status              | `--cms-success`, `--cms-warning`, `--cms-danger`, `--cms-info`     |
| Layout              | `--cms-space-*`, `--cms-radius-*`, `--cms-shadow-*`                |

Do not add raw hex, rgb, hsl, or legacy admin palette values to CMS UI files.
The exception is explicitly allowlisted data or control code: token definitions,
color normalization, tenant/site design-system data, extension configuration,
and builder preview data. The guardrail is:

```sh
pnpm check:cms-design-system
```

It also runs as part of `pnpm verify`.

## Component guidance

Prefer shared components for all new screens:

- `Button`, `IconButton`, `Panel`, `SectionHeader`, `Badge`, `Alert`, `Tabs`;
- `Popover`, `Tooltip`, `DropdownMenu`, `Accordion`, `Toast`, `Breadcrumbs`,
  and `Skeleton`;
- `TextField`, `TextAreaField`, `NumberField`, `SelectField`, `ComboboxField`,
  `MultiSelectField`, `CheckboxField`, `SwitchField`, `RadioGroupField`,
  `DateField`, `TimeField`, `DateTimeField`, and `ColorField`;
- `DataTable`, `PaginationControls`, `Modal`/`Dialog`, `Drawer`/`Sheet`,
  `LoadingState`, `EmptyState`, and `ErrorState`.

Add a primitive when the behavior is used by multiple features. Do not create a
feature-local visual variant for a one-off preference; document a new variant
when it represents a stable product pattern.

## Page anatomy

Collection and resource pages should normally use:

1. `PageHeader` with title, context, and one primary action.
2. `ResourceToolbar` or `SearchField` with search and relevant filters.
3. A bounded `DataTable` or resource list with loading, empty, and error states.
4. Pagination when the server result is paginated.
5. Drawer for medium create/edit/inspect tasks; dialog for focused or
   destructive decisions; dedicated page for complex configuration.

The Collection screen is the reference for density, spacing, selected states,
table treatment, and panel hierarchy. Preserve its business behavior while
reusing its visual language across resources.

## Builder chrome

The builder shell, toolbar, panels, controls, and overlays use the same CMS
Admin tokens and primitive state language as ordinary admin pages. The canvas
may intentionally retain a stricter minimum width and editor-specific preview
data. GrapesJS/vendor CSS is isolated in `third-party.css`; vendor selectors
must not become the source of truth for CMS chrome.

## Accessibility, motion, and responsive behavior

- Every form control has a visible label or an explicit accessible name.
- Keyboard focus is visible and never removed for convenience.
- Dialogs and drawers close with Escape, expose a label, and preserve focus
  behavior supplied by the shared surface implementation.
- Tables scroll in their own container and keep the shell usable on narrow
  screens.
- Sidebar and page actions collapse at responsive breakpoints; dialogs and
  drawers can become full-height/full-width on small screens.
- Use `prefers-reduced-motion` and keep transitions short and purposeful.
- Use inline SVG icons through `Icon`; do not introduce Unicode glyphs as UI
  icons.

## Reference surface

The internal showcase is available at:

```text
/workspaces/:workspaceId/admin-ui
```

It demonstrates foundations, controls, feedback states, tables, pagination,
drawers, and dialogs. It is a development reference, not a customer-facing
product route.

## Contribution checklist

Before adding or migrating a CMS screen:

- identify the semantic token and shared primitive for each new visual pattern;
- keep tenant, permission, route, and server contracts unchanged;
- verify loading, empty, error, disabled, focus, and narrow-screen states;
- keep SiteDesignSystem/customer website data isolated from CMS Admin styling;
- run `pnpm check:cms-design-system` and the smallest relevant CMS tests.
