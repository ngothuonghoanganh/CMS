import { describe, expect, it } from 'vitest';

import {
  OPEN_COMPOSITION_REGISTRY,
  OPEN_COMPOSITION_RECIPE_REGISTRY,
  OpenCompositionDocumentSchema,
  canComposeChild,
  instantiateOpenCompositionRecipe,
  migratePagePayloadToOpenComposition,
  migratePagePayloadV7ToOpenComposition,
  type OpenCompositionNode,
} from './open-composition';

function findNode(
  root: OpenCompositionNode,
  id: string,
): OpenCompositionNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const result = findNode(child, id);
    if (result) return result;
  }
  return undefined;
}

function collectIds(root: OpenCompositionNode): string[] {
  return [root.id, ...root.children.flatMap(collectIds)];
}

describe('Open Composition contract', () => {
  it('separates primitives, semantic nodes and behavior capabilities', () => {
    expect(OPEN_COMPOSITION_REGISTRY.stack.kind).toBe('primitive');
    expect(OPEN_COMPOSITION_REGISTRY.form.kind).toBe('semantic');
    expect(OPEN_COMPOSITION_REGISTRY.form.behaviors).toContain('action');
    expect(OPEN_COMPOSITION_REGISTRY.button.behaviors).toContain('action');
    expect(canComposeChild('form', 'form-field')).toBe(true);
    expect(canComposeChild('form-field', 'card')).toBe(false);
  });

  it('derives parent capabilities from the registry without ambiguous ownership', () => {
    for (const definition of Object.values(OPEN_COMPOSITION_REGISTRY)) {
      for (const childType of definition.allowedChildren) {
        expect(OPEN_COMPOSITION_REGISTRY[childType].allowedParents).toContain(
          definition.type,
        );
      }
    }
    expect(OPEN_COMPOSITION_REGISTRY.input.allowedParents).toContain('form-field');
    expect(OPEN_COMPOSITION_REGISTRY.input.allowedParents).not.toContain('form');
  });

  it('ships Contact Form as a normal editable composition with semantic references', () => {
    expect(OPEN_COMPOSITION_RECIPE_REGISTRY).toHaveLength(1);
    const document = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `copy-${sourceId}`,
    );

    const form = findNode(document.root, 'copy-form');
    const field = findNode(document.root, 'copy-email-field');
    const label = findNode(document.root, 'copy-email-label');
    const control = findNode(document.root, 'copy-email-input');
    const submit = findNode(document.root, 'copy-submit');

    expect(form?.type).toBe('form');
    expect(field?.type).toBe('form-field');
    expect(label?.type).toBe('label');
    expect(control?.type).toBe('input');
    expect(submit?.type).toBe('button');
    expect(submit?.children.map((child) => child.type)).toEqual(['icon', 'text']);
    expect(document.behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'field',
          nodeId: 'copy-email-field',
          formNodeId: 'copy-form',
          labelNodeId: 'copy-email-label',
          controlNodeId: 'copy-email-input',
        }),
        expect.objectContaining({
          kind: 'action',
          nodeId: 'copy-submit',
          action: 'submit-form',
          targetNodeId: 'copy-form',
        }),
      ]),
    );
    expect(new Set(collectIds(document.root)).size).toBe(
      collectIds(document.root).length,
    );
    expect(OpenCompositionDocumentSchema.parse(document)).toEqual(document);
  });

  it('allows visual re-composition without changing form semantics', () => {
    const document = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `draft-${sourceId}`,
    );
    const form = findNode(document.root, 'draft-form');
    if (!form) throw new Error('Expected form recipe node');

    const firstField = form.children.find((child) => child.id === 'draft-name-field');
    const actions = form.children.find((child) => child.id === 'draft-actions');
    if (!firstField || !actions) throw new Error('Expected form children');

    // A user can wrap/reorder visual content while the field/action behaviors
    // continue to identify their semantic owners by stable node id.
    form.children = [
      actions,
      firstField,
      ...form.children.filter((child) => child !== actions && child !== firstField),
    ];
    const parsed = OpenCompositionDocumentSchema.parse(document);
    expect(
      parsed.behaviors.find((behavior) => behavior.id === 'draft-name-field-behavior'),
    ).toEqual(
      expect.objectContaining({
        nodeId: 'draft-name-field',
        formNodeId: 'draft-form',
      }),
    );
  });

  it('rejects broken semantic references and invalid nesting', () => {
    const document = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `invalid-${sourceId}`,
    );
    const submitBehavior = document.behaviors.find(
      (behavior) => behavior.kind === 'action',
    );
    if (!submitBehavior || submitBehavior.kind !== 'action') {
      throw new Error('Expected submit behavior');
    }
    submitBehavior.targetNodeId = 'missing-form';
    expect(() => OpenCompositionDocumentSchema.parse(document)).toThrow(
      /missing target node/i,
    );

    const valid = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `invalid-tree-${sourceId}`,
    );
    const field = findNode(valid.root, 'invalid-tree-name-field');
    if (!field) throw new Error('Expected field node');
    field.children.push({
      id: 'invalid-tree-card',
      type: 'card',
      props: {},
      children: [],
    });
    expect(() => OpenCompositionDocumentSchema.parse(valid)).toThrow(
      /form-field cannot contain card/i,
    );
  });

  it('migrates a legacy closed Form into editable nodes without mutating the source', () => {
    const legacy = {
      version: 7 as const,
      metadata: { documentTitle: 'Legacy contact' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section-1',
            type: 'section',
            props: {},
            children: [
              {
                id: 'form-1',
                type: 'form',
                props: {
                  fields: [
                    {
                      id: 'email',
                      type: 'email',
                      label: 'Email address',
                      name: 'email',
                      required: true,
                      placeholder: 'you@example.com',
                    },
                    {
                      id: 'message',
                      type: 'textarea',
                      label: 'Message',
                      name: 'message',
                      required: false,
                    },
                  ],
                  submitLabel: 'Send message',
                  successMessage: 'Sent',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };
    const migrated = migratePagePayloadV7ToOpenComposition(legacy);
    const form = findNode(migrated.root, 'form-1');
    expect(form?.children.map((child) => child.type)).toEqual([
      'form-field',
      'form-field',
      'button',
    ]);
    expect(migrated.behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'field',
          formNodeId: 'form-1',
          fieldKey: 'email',
          inputType: 'email',
        }),
        expect.objectContaining({ action: 'submit-form', targetNodeId: 'form-1' }),
      ]),
    );
    expect(legacy.root.children[0]?.children[0]?.children).toEqual([]);
  });

  it('migrates a V1 page envelope so open recipes can be added to new pages', () => {
    const migrated = migratePagePayloadToOpenComposition({
      version: 1,
      metadata: { documentTitle: 'New page' },
      root: { id: 'root', type: 'root', props: {}, children: [] },
    });
    expect(migrated.version).toBe(8);
    expect(migrated.root).toMatchObject({ id: 'root', type: 'root', children: [] });
  });
});
