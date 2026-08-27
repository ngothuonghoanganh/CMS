# 02 — Current State and Problem Map

## 1. Why this consolidation exists

The project has progressed through many feature phases, but repeated usability and reliability issues indicate that some foundational concerns need consolidation before further expansion.

This document records the known problem classes that an AI agent should actively investigate in source code.

## 2. CMS information architecture problems

### Symptoms

- Too many independent cards/blocks on one screen.
- Screens become vertically very long.
- Detail, create, and update content can appear simultaneously.
- Tables/content can overflow horizontally.
- Responsive layouts collapse unpredictably.
- Actions are spread across multiple visual areas.

### Likely causes to inspect

- entity/database shape directly mapped to UI layout;
- lack of standardized list/detail/edit patterns;
- inconsistent page shells;
- no shared responsive container primitives;
- tables not designed as dedicated data-table components;
- action hierarchy not standardized.

## 3. Properties / Inspector problems

### Symptoms

- too many controls visible at once;
- long scrolling panel;
- difficult to understand which property affects what;
- controls may use generic text inputs even when a semantic control is available;
- property updates have previously failed to persist correctly.

### Likely causes to inspect

- hand-written property forms per component;
- duplicate state between selected component, local form state, editor state, and server page payload;
- useEffect-based synchronization in multiple directions;
- missing property schema;
- missing default/validation/conditional metadata;
- no responsive override model.

## 4. Builder state problems

### Symptoms

- changes appear visually but are not saved;
- save/reload does not reproduce current state;
- different panels can disagree on selected/current values;
- renderer may not reproduce builder output.

### Audit questions

- What is the canonical source of page state?
- Does GrapesJS own state, React own state, or both?
- Is page content copied into Zustand/Redux/context/local state?
- Are mutations applied directly to GrapesJS and separately to payload state?
- Does save serialize current authoritative state or a stale copy?
- Does refetch overwrite dirty editor state?
- Is query cache treated as editor state?

## 5. Drag/drop and structure problems

### Symptoms

- drag/drop is difficult to control;
- cursor/hand/pan feedback is weak;
- Layers drag differs from Canvas drag;
- moving between different parent elements fails or is confusing;
- nested elements are difficult to manipulate.

### Likely causes

- multiple independent DnD implementations;
- no shared `canDrop` rules;
- no explicit before/inside/after drop semantics;
- parent/child restrictions embedded in UI code;
- no command layer for move/reparent;
- no visual insertion model.

## 6. Builder ↔ Renderer contract drift

### Symptoms

A component can exist/configure in the builder yet fail to render correctly publicly; forms have previously exhibited this class of issue.

### Audit questions

- Is there one component registry shared by builder and renderer?
- Are type names duplicated as string literals?
- Does renderer contain a switch statement that can fall behind editor definitions?
- Are component props validated/versioned?
- Are migrations available for old documents?
- Is published payload the same contract used by preview?

## 7. API/refetch loop problems

### Symptoms

CMS and/or renderer repeatedly call APIs.

### Likely causes

- effect dependencies include unstable objects/functions;
- mutation success triggers invalidation, refetch, state write, then mutation again;
- preview uses polling unnecessarily;
- tenant/context initialization repeatedly invalidates queries;
- serialized document identity changes every render;
- autosave lacks explicit dirty tracking.

### Required diagnostics

For each key screen, inspect the network graph and answer:

- Which request fires on mount?
- Which request fires after idle?
- Which request fires after one edit?
- Why does it fire?
- Does it fire again without user action?

## 8. Responsive CMS problems

Responsive admin behavior must be treated independently from landing-page responsive editing.

Audit:

- fixed widths;
- overflow-x;
- nested min-width;
- sidebars that do not collapse;
- tables without scroll containers;
- modals wider than viewport;
- property panels that leave canvas unusably narrow;
- sticky headers/footers causing overlap.

## 9. Design-system fragmentation

Search for duplicate implementations of:

- Button;
- Input;
- Select;
- Modal/Dialog;
- Drawer/Sheet;
- Table;
- Pagination;
- FormField/Error;
- Date/Time inputs;
- Color picker;
- Toast;
- Tabs;
- Accordion;
- Dropdown menu;
- Confirmation dialog.

Fragmentation creates inconsistent UX and makes global improvements expensive.

## 10. Technical-debt investigation list

During deep audit, explicitly identify:

- dead files/components/hooks;
- duplicated utilities;
- unused packages;
- circular dependencies;
- oversized React components;
- direct API calls bypassing shared clients;
- duplicated DTO/types;
- magic component-type strings;
- unbounded effects;
- missing error boundaries;
- missing loading/empty/error states;
- tenant-unaware caches;
- missing indexes/constraints where visible from source;
- inconsistent validation between frontend/backend.
