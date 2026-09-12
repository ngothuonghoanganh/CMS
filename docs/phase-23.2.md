# Phase 23.2 — Semantic Editing Integrity & Single Source of Truth

**Status:** Implemented on the Phase 23.2 feature branch; the final merge
record is maintained in `docs/continuity/phase-23.2-final-handoff.md`.

## Semantic ownership decisions

- Button and Link visual words are owned by their real `text` child. The
  parent `props.label` remains only as a derived compatibility projection and
  is canonicalized to the child before load, save, and render.
- Form Field behavior owns `fieldKey`, `inputType`, `required`, and the label
  and control references. Form Field props, control type/name, and choice
  options are derived projections.
- Quote attribution is canonically `cite`; persisted `citation` values are
  migrated one way without losing attribution.
- Video `src`, `poster`, and `controls` are carried through the Open
  Composition adapter and rendered with the same safe asset rules.
- Select and radio controls use a bounded Options editor. Labels are required,
  values are normalized and deduplicated, and a usable default list is
  created for an empty choice field.

## Form ownership and authoring prevention

Form Fields are the only normal authoring entry point for a field label and
control. Loose Label, Input, Textarea, and Select insertion is hidden from
semantic structure surfaces. Generic Open Composition Form insertion is also
hidden; Contact Form recipes and the complete Form factory create fields and a
`submit-form` action together.

The canonicalizer repairs legacy V8 fields at the load/save boundary, prunes
orphan field/action behaviors, remaps control type transitions, and keeps
serialization stable. Legacy V1–V7 payloads remain on their existing closed
contracts until explicitly promoted to V8.

## Verification

Contract, adapter, command, Inspector, API persistence, and renderer paths now
share the same canonical semantic transformation. Regression coverage includes
canonical Button/Link content, Form behavior ownership and type transitions,
choice option operations, Quote attribution, Video poster rendering, save /
reload, preview, and public renderer parity. The dedicated browser journey is
`tests/e2e/phase-23.2-semantic-integrity.spec.ts`.
