# Phase 23.3 — Authoring Guardrails & Canvas Parity

**Status:** CLOSED — the merge and post-merge verification record is maintained
in `docs/continuity/phase-23.3-final-handoff.md`.

## Structural guardrails

- A V8 `form-field` is an owned semantic unit and may only be a direct child of
  a `form`. The shared registry, command boundary, placement validation, and
  canonicalizer enforce the same rule.
- Form Field is the no-code entry point for a label and control. Loose Label,
  Input, Textarea, and Select insertion is not offered from the generic Form
  Field surface, and a generic container cannot insert a Form Field.
- A valid Form-to-Form move rebinds `formNodeId`, preserves field semantics,
  and gives a conflicting `fieldKey` a deterministic unique suffix. Invalid
  moves are rejected before the live tree changes.
- Form Field duplication remaps node IDs, behavior references, control names,
  and field keys. Removal prunes owned behavior references and protected child
  controls cannot be removed independently.

## Canvas and runtime parity

- Select and radio Canvas projections derive their labels and order from the
  canonical control `props.options` rather than placeholder content.
- Icon names use the framework-independent deterministic path registry in
  `packages/contracts/src/open-composition-icons.ts`; Canvas and public runtime
  render the same inline SVG contract without a remote icon dependency.
- Video poster edits mirror the safe asset value to the live Canvas attribute,
  including removal, and the public renderer applies the same safe image rule.
- Form Field's aggregate Inspector exposes label, type, required, placeholder,
  and choice options without requiring a user to select a nested Input.

## Options editor

Choice rows have temporary stable editor identities. Those identities are used
only as React keys; persisted options contain only `label` and `value`. Draft
typing updates the Canvas live without remounting rows, while canonicalization
and validation run at commit boundaries. Labels, unique normalized values, a
bounded option count, and a usable non-empty default list remain enforced.

## Compatibility

The V8 canonicalizer repairs legacy Button/Link and Form Field projections,
normalizes choice options, translates the legacy Quote attribution alias, and
drops orphan Form Field placements/behaviors at the load boundary. V1–V7
payloads continue to use their existing closed contracts until explicit V8
migration; published historical payloads are not mutated in place.

## Verification

Unit coverage exercises registry ownership, aggregate semantic commands,
Form-to-Form behavior remapping, duplicate/delete safety, Canvas projections,
icon/video live updates, and canonicalizer idempotence. The dedicated browser
journey is `tests/e2e/phase-23.3-authoring-guardrails.spec.ts` and covers live
Select/Radio options, semantic Form Field editing, keyboard typing, icon and
poster updates, save/reload, preview, publish, public rendering, and browser
error classification.
