import { describe, expect, it } from 'vitest';

import {
  OPEN_COMPOSITION_REGISTRY,
  OPEN_COMPOSITION_AUTHORING_REGISTRY,
  OPEN_COMPOSITION_RECIPE_REGISTRY,
  OpenCompositionDocumentSchema,
  canComposeChild,
  instantiateOpenCompositionRecipe,
  getOpenCompositionAuthoringDefinition,
  getOpenCompositionAuthoringProperty,
  openCompositionInsertableChildren,
  migratePagePayloadToOpenComposition,
  migratePagePayloadV7ToOpenComposition,
  OpenCompositionPayloadSchema,
  type OpenCompositionNode,
} from './open-composition';
import {
  canonicalizeOpenCompositionOptions,
  canonicalizeOpenCompositionPayload,
} from './open-composition-semantic-integrity';

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
    expect(canComposeChild('form-field', 'text')).toBe(false);
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
    expect(OPEN_COMPOSITION_REGISTRY['form-field'].allowedParents).toEqual(['form']);
    expect(canComposeChild('section', 'form-field')).toBe(false);
    expect(canComposeChild('container', 'form-field')).toBe(false);
  });

  it('provides explicit no-code authoring metadata instead of inferring controls from props', () => {
    const heading = getOpenCompositionAuthoringDefinition('heading');
    const field = getOpenCompositionAuthoringDefinition('form-field');
    const grid = getOpenCompositionAuthoringDefinition('grid');

    expect(heading.properties.map((property) => property.label)).toEqual([
      'Heading text',
      'Heading level',
    ]);
    expect(getOpenCompositionAuthoringProperty('button', 'href')).toEqual(
      expect.objectContaining({ label: 'Link', control: 'link' }),
    );
    expect(getOpenCompositionAuthoringProperty('button', 'formKey')).toBeUndefined();
    expect(field.properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'required',
          label: 'Required field',
          control: 'toggle',
        }),
      ]),
    );
    expect(grid.styleGroups.map((group) => group.label)).toContain('Layout');
    expect(
      grid.styleGroups
        .flatMap((group) => group.properties)
        .find((property) => property.key === 'grid-template-columns'),
    ).toEqual(expect.objectContaining({ label: 'Columns', control: 'segmented' }));
    expect(Object.keys(OPEN_COMPOSITION_AUTHORING_REGISTRY)).toHaveLength(
      Object.keys(OPEN_COMPOSITION_REGISTRY).length,
    );
  });

  it('assigns an explicit authoring disposition to every node type', () => {
    for (const [type, registryDefinition] of Object.entries(OPEN_COMPOSITION_REGISTRY)) {
      const authoring = getOpenCompositionAuthoringDefinition(
        type as keyof typeof OPEN_COMPOSITION_REGISTRY,
      );
      expect(['authorable', 'read-only', 'internal']).toContain(
        registryDefinition.authoring.disposition,
      );
      expect(authoring.disposition).toBe(registryDefinition.authoring.disposition);
      expect(authoring.insertable).toBe(registryDefinition.authoring.insertable);
      if (authoring.disposition === 'authorable') {
        expect(
          authoring.styleGroups.length + authoring.properties.length,
        ).toBeGreaterThan(0);
      } else {
        expect(authoring.insertable).toBe(false);
      }
    }

    expect(openCompositionInsertableChildren('form')).toContain('form-field');
    expect(openCompositionInsertableChildren('form')).not.toContain('input');
    expect(openCompositionInsertableChildren('form-field')).toEqual([]);
    expect(OPEN_COMPOSITION_REGISTRY.form.authoring.directInsert).toBe(false);
    expect(openCompositionInsertableChildren('form')).not.toContain('reusable-instance');
    expect(openCompositionInsertableChildren('root')).not.toContain('root');
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

    const orphan = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `orphan-${sourceId}`,
    );
    const orphanForm = findNode(orphan.root, 'orphan-form');
    const orphanField = orphanForm?.children.find((child) => child.type === 'form-field');
    if (!orphanForm || !orphanField) throw new Error('Expected orphan test fixture');
    orphanForm.children = orphanForm.children.filter((child) => child !== orphanField);
    orphan.root.children[0]?.children.push(orphanField);
    expect(() => OpenCompositionDocumentSchema.parse(orphan)).toThrow(
      /form-field cannot be placed inside section/i,
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

  it('canonicalizes composed labels and preserves legacy attribution', () => {
    const payload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Canonical content' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'button',
                type: 'button',
                props: { label: 'Stale label', href: '/send' },
                children: [
                  { id: 'icon', type: 'icon', props: { name: 'mail' }, children: [] },
                  {
                    id: 'button-text',
                    type: 'text',
                    props: { text: 'Send now' },
                    children: [],
                  },
                ],
              },
              {
                id: 'link',
                type: 'link',
                props: { text: 'Legacy link', href: '/docs' },
                children: [],
              },
              {
                id: 'quote',
                type: 'quote',
                props: { text: 'A quote', citation: 'An author' },
                children: [],
              },
            ],
          },
        ],
      },
      behaviors: [],
    });
    const canonical = canonicalizeOpenCompositionPayload(payload);
    const button = findNode(canonical.root, 'button');
    const link = findNode(canonical.root, 'link');
    const quote = findNode(canonical.root, 'quote');
    expect(button?.props).toMatchObject({ label: 'Send now' });
    expect(button?.props.text).toBeUndefined();
    expect(button?.children.map((child) => child.type)).toEqual(['icon', 'text']);
    expect(link?.props).toMatchObject({ label: 'Legacy link' });
    expect(link?.children[0]?.props.text).toBe('Legacy link');
    expect(quote?.props).toMatchObject({ cite: 'An author' });
    expect(quote?.props.citation).toBeUndefined();
  });

  it('repairs form field ownership and makes choice options canonical', () => {
    const payload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Canonical form' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: { formKey: 'contact' },
            children: [
              {
                id: 'form',
                type: 'form',
                props: { formKey: 'contact' },
                children: [
                  {
                    id: 'field',
                    type: 'form-field',
                    props: { fieldKey: 'choice', required: false },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      behaviors: [],
    });
    const field = findNode(payload.root, 'field');
    if (!field) throw new Error('Expected field');
    field.children = [
      { id: 'label', type: 'label', props: { text: 'Choice' }, children: [] },
      {
        id: 'control',
        type: 'input',
        props: {
          type: 'radio',
          name: 'stale-name',
          options: [
            { label: 'One', value: 'same' },
            { label: 'Two', value: 'same' },
          ],
        },
        children: [],
      },
    ];
    const canonical = canonicalizeOpenCompositionPayload(payload);
    const canonicalField = findNode(canonical.root, 'field');
    const control = findNode(canonical.root, 'control');
    const behavior = canonical.behaviors.find(
      (candidate) => candidate.kind === 'field' && candidate.nodeId === 'field',
    );
    expect(canonicalField?.props).toMatchObject({ fieldKey: 'choice', required: false });
    expect(control?.type).toBe('input');
    expect(control?.props).toMatchObject({
      fieldKey: 'choice',
      name: 'choice',
      type: 'radio',
    });
    expect(control?.props.options).toEqual([
      { label: 'One', value: 'same' },
      { label: 'Two', value: 'same-2' },
    ]);
    expect(behavior).toMatchObject({
      kind: 'field',
      formNodeId: 'form',
      controlNodeId: 'control',
      inputType: 'radio',
    });
    expect(OpenCompositionPayloadSchema.parse(canonical)).toEqual(canonical);
  });

  it('adds exactly one label and control when a legacy field is empty', () => {
    const payload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Empty field' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'section',
            type: 'section',
            props: {},
            children: [
              {
                id: 'form',
                type: 'form',
                props: { formKey: 'empty' },
                children: [{ id: 'field', type: 'form-field', props: {}, children: [] }],
              },
            ],
          },
        ],
      },
      behaviors: [],
    });

    const canonical = canonicalizeOpenCompositionPayload(payload);
    const field = findNode(canonical.root, 'field');
    expect(field?.children.map((child) => child.type)).toEqual(['label', 'input']);
    expect(
      canonical.behaviors.filter(
        (behavior) => behavior.kind === 'field' && behavior.nodeId === 'field',
      ),
    ).toHaveLength(1);
  });

  it('provides bounded defaults for invalid choice option drafts', () => {
    expect(canonicalizeOpenCompositionOptions(['', { label: '', value: '' }])).toEqual([
      { label: 'Option 1', value: 'option-1' },
      { label: 'Option 2', value: 'option-2' },
    ]);
  });

  it('deduplicates semantic behaviors during canonicalization', () => {
    const document = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `behavior-${sourceId}`,
    );
    const payload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Behavior ownership' },
      root: document.root,
      behaviors: document.behaviors,
    });
    const fieldBehavior = payload.behaviors.find((behavior) => behavior.kind === 'field');
    if (!fieldBehavior) throw new Error('Expected a field behavior');
    payload.behaviors.push({ ...fieldBehavior, id: 'duplicate-field-behavior' });

    const canonical = canonicalizeOpenCompositionPayload(payload);
    expect(
      canonical.behaviors.filter(
        (behavior) =>
          behavior.kind === 'field' && behavior.nodeId === fieldBehavior.nodeId,
      ),
    ).toHaveLength(1);
    expect(new Set(canonical.behaviors.map((behavior) => behavior.id)).size).toBe(
      canonical.behaviors.length,
    );
  });

  it('keeps semantic canonicalization idempotent for composed form values', () => {
    const document = instantiateOpenCompositionRecipe('contact-form', (sourceId) =>
      sourceId === 'root' ? 'root' : `stable-${sourceId}`,
    );
    const payload = OpenCompositionPayloadSchema.parse({
      version: 8,
      metadata: { documentTitle: 'Idempotent semantics' },
      root: document.root,
      behaviors: document.behaviors,
    });
    const once = canonicalizeOpenCompositionPayload(payload);
    expect(canonicalizeOpenCompositionPayload(once)).toEqual(once);
  });
});
