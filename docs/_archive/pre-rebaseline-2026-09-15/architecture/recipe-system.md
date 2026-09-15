# Recipe System

Recipes are validated detached `OpenCompositionDocument` graphs. A recipe is
not a special runtime widget: instantiation gives every node and behavior a
fresh ID and rewrites all node references in one pass.

The builder currently exposes `contact-form` as a conversion preset. Its
fields, labels, controls, action button, and reply note are ordinary nodes, so
users can reorder or wrap them while the field and submit relationships remain
ID-based. When a recipe subtree is inserted, its behaviors are collected from
the subtree and validated together with the page root on save.

Future recipes should add a contract fixture and a builder catalog entry; they
should not add another closed widget schema for a composition that can be
represented by primitives and behaviors.
