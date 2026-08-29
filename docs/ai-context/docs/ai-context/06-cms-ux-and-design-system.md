# 06 — CMS UX and Design System

## 1. CMS philosophy

The CMS should be task-oriented rather than database-oriented.

A screen should answer:

- what am I managing?
- what is the primary action?
- what items exist?
- how do I search/filter them?
- how do I view/edit one item?

Avoid rendering every CRUD state inline on the same page.

## 2. Standard list-page pattern

Recommended:

```text
Page title                              + Primary action
Short contextual description (optional)
Search  Filters  View options
────────────────────────────────────────────────────
Data table/list
────────────────────────────────────────────────────
Pagination
```

The table area should have its own horizontal overflow behavior when needed rather than overflowing the whole application shell.

## 3. Interaction selection matrix

Use the smallest pattern that preserves clarity:

| Task                     | Preferred pattern      |
| ------------------------ | ---------------------- |
| delete confirmation      | dialog                 |
| rename/simple edit       | inline or small dialog |
| create 3–8 simple fields | dialog or drawer       |
| inspect medium detail    | drawer                 |
| edit medium entity       | drawer                 |
| complex configuration    | dedicated page         |
| page visual builder      | dedicated workspace    |
| large data table         | normal page, not modal |
| multi-step setup         | dedicated flow/page    |

Modal is not a universal solution.

## 4. Application shell

Keep global navigation stable. The inner content layout may be redesigned.

Header requirements:

- current company indicator;
- page/context title where appropriate;
- user/account actions;
- no casual company switching if product rules say current account belongs to one company context.

Sidebar:

- consistent width/collapse behavior;
- stable active state;
- scrolling independent from main content when necessary;
- responsive collapse to overlay/drawer on small screens.

## 5. Design-system requirement

Create or consolidate a shared UI package/library.

Core primitives should include:

- Button;
- IconButton;
- Input;
- Textarea;
- NumberInput;
- Select;
- Combobox;
- MultiSelect;
- Switch/Checkbox/Radio;
- DatePicker;
- TimePicker;
- ColorPicker;
- FormField;
- Dialog;
- Drawer/Sheet;
- Popover;
- Tooltip;
- DropdownMenu;
- Tabs;
- Accordion;
- DataTable;
- Pagination;
- Badge;
- EmptyState;
- Skeleton;
- Alert;
- Toast;
- Breadcrumbs.

Features should not implement new variants from scratch unless the shared primitive cannot satisfy a documented requirement.

## 6. Input behavior rules

### Number

- numeric keyboard/input mode;
- reject invalid characters or normalize safely;
- min/max/step when applicable;
- optional plus/minus stepper.

### Color

- visible swatch;
- picker;
- hex/rgb input if advanced use requires it;
- clear/reset when property supports inheritance.

### Date/time

Use calendar/time controls rather than free-form text unless arbitrary text input is truly required.

### Select

Use searchable combobox for large option sets. Avoid rendering hundreds of options in a basic select.

### Validation

- label and help text near field;
- inline error;
- error message describes how to recover;
- server validation errors map to fields when possible.

## 7. Data-table rules

Every non-trivial table should consider:

- scroll container;
- sticky header if useful;
- sorting;
- filter/search;
- row actions menu;
- pagination;
- loading state;
- empty state;
- error state;
- responsive column priority;
- bulk actions only when valuable.

Avoid giant row cards when a table communicates comparison more efficiently.

## 8. Responsive admin breakpoints

The application should define explicit shell behavior by width instead of relying on accidental wrapping.

Example strategy:

- wide desktop: fixed sidebar + rich content;
- desktop: collapsible sidebar;
- tablet: overlay sidebar, reduced table columns, drawers full-height;
- phone: stacked content, page actions condensed, full-screen dialogs/drawers where needed.

Visual builder can have a stricter minimum supported width than ordinary CMS pages.

## 9. Density

Use compact but readable admin density:

- avoid oversized decorative cards;
- avoid repeating titles inside nested cards;
- group related controls;
- secondary metadata should be visually subordinate;
- dangerous actions belong in menus/confirmation paths unless immediately necessary.

## 10. Accessibility baseline

At minimum:

- keyboard reachable actions;
- visible focus;
- labels associated with controls;
- sufficient contrast;
- dialog focus trapping;
- Escape behavior where expected;
- menu/list keyboard navigation;
- status changes exposed accessibly where practical.
