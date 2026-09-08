# Behavior and Action Model

Open Composition keeps visual structure and runtime meaning separate.

- `field` attaches to a Form Field and points to its Form, Label, and control.
- `action` attaches to a Button or other capable node and may submit/reset a
  Form, toggle state, or navigate.
- `state-binding` connects a node property to a state path and can carry a
  simple condition.

The contract validates source IDs, target IDs, node capabilities, field
control types, and Form-only submit/reset targets. The public renderer uses
field behaviors to control HTML inputs and action behaviors to select submit or
reset behavior. The API's adapter turns those same relationships into the
existing `FormProps` shape used by validation, storage, and integrations.
