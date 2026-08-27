import { describe, expect, it } from 'vitest';

import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  BUILDER_EXTENSION_PROPS_ATTRIBUTE,
  BUILDER_PAYLOAD_VERSION_ATTRIBUTE,
  BUILDER_RESPONSIVE_STYLE_ATTRIBUTE,
  BuilderAdapterError,
  createBlockDefinition,
  payloadToEditorComponent,
  serializeEditorSnapshot,
  snapshotFromEditorDefinition,
} from './builder-adapter';
import { isBuilderNodeType } from './builder-interaction';

const payload = {
  version: 1 as const,
  metadata: {
    documentTitle: 'Launch page',
    documentDescription: 'A round-trip fixture',
  },
  root: {
    id: 'root',
    type: 'root' as const,
    props: {},
    children: [
      {
        id: 'hero',
        type: 'section' as const,
        props: {},
        style: {
          base: { padding: '64px 24px', backgroundColor: '#111827' },
          tablet: { padding: '48px 20px' },
          mobile: { padding: '32px 16px' },
        },
        children: [
          {
            id: 'copy',
            type: 'container' as const,
            props: {},
            children: [
              {
                id: 'headline',
                type: 'text' as const,
                props: { text: 'Ship faster', align: 'center' as const },
                children: [],
              },
              {
                id: 'cta',
                type: 'button' as const,
                props: {
                  label: 'Start now',
                  href: 'https://example.com/start',
                  target: '_blank' as const,
                },
                style: { base: { borderRadius: '8px', padding: '12px 18px' } },
                children: [],
              },
            ],
          },
          {
            id: 'hero-image',
            type: 'image' as const,
            props: { src: '/assets/hero.png', alt: 'Hero illustration' },
            children: [],
          },
        ],
      },
    ],
  },
};

describe('builder adapter', () => {
  it('hydrates the frozen payload into an explicit editor definition', () => {
    const definition = payloadToEditorComponent(payload);

    expect(definition.tagName).toBe('main');
    expect(definition.attributes?.[BUILDER_NODE_ID_ATTRIBUTE]).toBe('root');
    expect(definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('root');
    expect(definition.attributes?.[BUILDER_RESPONSIVE_STYLE_ATTRIBUTE]).toBeUndefined();
    expect(definition.components).toHaveLength(1);
    expect((definition.components as Array<Record<string, unknown>>)[0]!.tagName).toBe(
      'section',
    );
  });

  it('round-trips supported nodes, props, ids, styles and responsive data', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);

    expect(serializeEditorSnapshot(snapshot)).toEqual(payload);
  });

  it('creates page-local ids for newly inserted blocks', () => {
    const definition = createBlockDefinition('text');
    const id = definition.attributes?.[BUILDER_NODE_ID_ATTRIBUTE];

    expect(id).toMatch(/^text-/);
    expect(definition.attributes?.[BUILDER_NODE_TYPE_ATTRIBUTE]).toBe('text');
  });

  it('does not upgrade V1 because text content happens to mention a form', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    snapshot.children[0]!.children[0]!.children[0]!.content = '{"type":"form"}';

    expect(serializeEditorSnapshot(snapshot).version).toBe(1);
  });

  it('fails instead of silently dropping unsupported editor nodes', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    snapshot.children[0]!.attributes[BUILDER_NODE_TYPE_ATTRIBUTE] = 'video';

    expect(() => serializeEditorSnapshot(snapshot)).toThrow(BuilderAdapterError);
    expect(() => serializeEditorSnapshot(snapshot)).toThrow(
      'Unsupported editor node type',
    );
  });

  it('fails validation for unsafe edited image sources', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    snapshot.children[0]!.children[1]!.attributes.src = 'javascript:alert(1)';

    expect(() => serializeEditorSnapshot(snapshot)).toThrow('Image source must be');
  });

  it('fails on editor styles outside the V1 vocabulary', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    snapshot.children[0]!.style['box-shadow'] = 'none';

    expect(() => serializeEditorSnapshot(snapshot)).toThrow(
      'Unsupported editor style property',
    );
  });

  it('round-trips a V2 form node without widening V1 editor data', () => {
    const formPayload = {
      version: 2 as const,
      metadata: { documentTitle: 'Form page' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'section',
            type: 'section' as const,
            props: {},
            children: [
              {
                id: 'form',
                type: 'form' as const,
                props: {
                  fields: [
                    {
                      id: 'email',
                      type: 'email' as const,
                      label: 'Email',
                      name: 'email',
                      required: true,
                    },
                  ],
                  submitLabel: 'Send',
                  successMessage: 'Thanks',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };
    const definition = payloadToEditorComponent(formPayload);
    const section = (definition.components as Array<Record<string, unknown>>)[0]!;
    const form = (section.components as Array<Record<string, unknown>>)[0]!;
    const formAttributes = form.attributes as Record<string, unknown>;
    const formPreview = form.components as Array<Record<string, unknown>>;
    expect(definition.attributes?.[BUILDER_PAYLOAD_VERSION_ATTRIBUTE]).toBe('2');
    expect(formAttributes[BUILDER_FORM_PROPS_ATTRIBUTE]).toContain('email');
    expect(formPreview).toHaveLength(2);
    expect(
      (formPreview[0]!.attributes as Record<string, unknown>)[
        BUILDER_FORM_PREVIEW_ATTRIBUTE
      ],
    ).toBe('field');
    expect(serializeEditorSnapshot(snapshotFromEditorDefinition(definition))).toEqual(
      formPayload,
    );
  });

  it('registers and round-trips the Countdown extension as PagePayload V3', () => {
    const definition = createBlockDefinition('countdown');
    expect(definition.attributes?.[BUILDER_COUNTDOWN_PROPS_ATTRIBUTE]).toContain(
      'Launch countdown',
    );
    const payload = {
      version: 3 as const,
      metadata: { documentTitle: 'Countdown page' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'section',
            type: 'section' as const,
            props: {},
            children: [
              {
                id: 'countdown',
                type: 'countdown' as const,
                props: {
                  label: 'Launch countdown',
                  targetAt: '2030-01-01T00:00:00.000Z',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };
    expect(
      serializeEditorSnapshot(
        snapshotFromEditorDefinition(payloadToEditorComponent(payload)),
      ),
    ).toEqual(payload);
  });

  it('creates and round-trips a declarative custom extension block as V3', () => {
    const definition = createBlockDefinition('extension', 'custom-launch');
    expect(definition.attributes?.[BUILDER_EXTENSION_PROPS_ATTRIBUTE]).toContain(
      'custom-launch',
    );
    const payload = {
      version: 3 as const,
      metadata: { documentTitle: 'Custom extension page' },
      root: {
        id: 'root',
        type: 'root' as const,
        props: {},
        children: [
          {
            id: 'section',
            type: 'section' as const,
            props: {},
            children: [
              {
                id: 'custom-launch',
                type: 'extension' as const,
                props: { extensionId: 'custom-launch', values: {} },
                children: [],
              },
            ],
          },
        ],
      },
    };
    expect(
      serializeEditorSnapshot(
        snapshotFromEditorDefinition(payloadToEditorComponent(payload)),
      ),
    ).toEqual(payload);
  });

  it('recognizes extension nodes at the shared interaction boundary', () => {
    expect(isBuilderNodeType('extension')).toBe(true);
  });
});
