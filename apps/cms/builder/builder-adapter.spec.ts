import { describe, expect, it } from 'vitest';
import {
  type PagePayloadV1,
  type PagePayloadV4,
  type PagePayloadV5,
  type PagePayloadV6,
  type SiteGlobalPayloadV1,
} from '@payload/contracts';

import {
  BUILDER_NODE_ID_ATTRIBUTE,
  BUILDER_NODE_TYPE_ATTRIBUTE,
  BUILDER_FORM_PROPS_ATTRIBUTE,
  BUILDER_FORM_PREVIEW_ATTRIBUTE,
  BUILDER_COUNTDOWN_PROPS_ATTRIBUTE,
  BUILDER_EXTENSION_PROPS_ATTRIBUTE,
  BUILDER_PAYLOAD_VERSION_ATTRIBUTE,
  BUILDER_RESPONSIVE_STYLE_ATTRIBUTE,
  BUILDER_HEADING_LEVEL_ATTRIBUTE,
  BUILDER_LIST_PROPS_ATTRIBUTE,
  BUILDER_COMPOUND_PROPS_ATTRIBUTE,
  BUILDER_PARTS_STYLE_ATTRIBUTE,
  BUILDER_GLOBAL_PROPS_ATTRIBUTE,
  BuilderAdapterError,
  createBlockDefinition,
  formatCountdownRemaining,
  payloadToEditorComponent,
  resolveViewportStyle,
  serializeEditorSnapshot,
  serializeSiteGlobalSnapshot,
  sanitizeInlineText,
  snapshotFromEditorDefinition,
} from './builder-adapter';
import { isBuilderNodeType } from './builder-interaction';
import {
  assertUniquePersistedNodeIds,
  collectPersistedNodeIds,
  remapSubtreeNodeIds,
} from './builder-node-identity';

const payload: PagePayloadV1 = {
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
          base: {
            padding: '64px 24px',
            backgroundColor: '#111827',
            flexDirection: 'column',
            borderWidth: '1px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.2)',
          },
          tablet: { padding: '48px 20px', gap: '24px' },
          mobile: { padding: '32px 16px', width: '100%' },
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

  it('does not promote a painted tablet style into the authored base block', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    const hero = snapshot.children[0];
    if (!hero) throw new Error('Hero snapshot is missing');
    hero.style = {
      padding: '48px 20px',
      gap: '24px',
    };
    expect(serializeEditorSnapshot(snapshot).root.children[0]?.style).toEqual(
      payload.root.children[0]?.style,
    );
  });

  it('resolves desktop, tablet, and mobile styles with the renderer cascade', () => {
    const style = {
      base: { color: '#111111', fontSize: '32px', padding: '48px' },
      tablet: { fontSize: '26px', padding: '32px' },
      mobile: { padding: '16px' },
    } as const;

    expect(resolveViewportStyle(style, 'desktop')).toEqual(style.base);
    expect(resolveViewportStyle(style, 'tablet')).toEqual({
      ...style.base,
      ...style.tablet,
    });
    expect(resolveViewportStyle(style, 'mobile')).toEqual({
      ...style.base,
      ...style.tablet,
      ...style.mobile,
    });
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
    snapshot.children[0]!.attributes[BUILDER_NODE_TYPE_ATTRIBUTE] = 'unsupported';

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

  it('fails validation for unsafe edited style values', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    snapshot.children[0]!.style['background-color'] = 'url(javascript:alert(1))';

    expect(() => serializeEditorSnapshot(snapshot)).toThrow('unsafe CSS value');
  });

  it('fails on editor styles outside the shared vocabulary', () => {
    const definition = payloadToEditorComponent(payload);
    const snapshot = snapshotFromEditorDefinition(definition);
    snapshot.children[0]!.style['not-a-style'] = 'none';

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
    // Runtime classes are painted on the iframe DOM, not persisted in the
    // GrapesJS model (which otherwise treats preview descendants as selectors).
    expect(formAttributes.class).toBeUndefined();
    expect((formPreview[0]!.attributes as Record<string, unknown>).class).toBeUndefined();
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
    expect(formatCountdownRemaining('2000-01-01T00:00:00.000Z')).toBe('0d 0h 0m 0s');
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

  it('round-trips the V4 semantic element set and keeps list previews editor-only', () => {
    const payload: PagePayloadV4 = {
      version: 4 as const,
      metadata: { documentTitle: 'V4 page' },
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
                id: 'heading',
                type: 'heading' as const,
                props: { text: 'A heading', level: 3 },
                children: [],
              },
              {
                id: 'link',
                type: 'link' as const,
                props: { text: 'Read docs', href: '/docs', target: '_self' as const },
                children: [],
              },
              { id: 'divider', type: 'divider' as const, props: {}, children: [] },
              {
                id: 'list',
                type: 'list' as const,
                props: {
                  ordered: true,
                  items: [
                    { id: 'first', text: 'First' },
                    { id: 'second', text: 'Second' },
                  ],
                },
                children: [],
              },
              {
                id: 'video',
                type: 'video' as const,
                props: {
                  src: '/assets/demo.mp4',
                  poster: '/assets/poster.png',
                  controls: true,
                  autoplay: false,
                  muted: false,
                  loop: true,
                  playsInline: true,
                },
                children: [],
              },
            ],
          },
        ],
      },
    };
    const definition = payloadToEditorComponent(payload);
    const section = (definition.components as Array<Record<string, unknown>>)[0]!;
    const elements = section.components as Array<Record<string, unknown>>;
    expect(elements[0]?.tagName).toBe('h3');
    expect(
      (elements[0]?.attributes as Record<string, unknown> | undefined)?.[
        BUILDER_HEADING_LEVEL_ATTRIBUTE
      ],
    ).toBe('3');
    expect(elements[3]?.tagName).toBe('ol');
    expect(
      (elements[3]?.attributes as Record<string, unknown> | undefined)?.[
        BUILDER_LIST_PROPS_ATTRIBUTE
      ],
    ).toContain('first');
    expect(elements[3]?.components).toHaveLength(2);
    expect(serializeEditorSnapshot(snapshotFromEditorDefinition(definition))).toEqual(
      payload,
    );
  });

  it('round-trips V5 compound nodes and keeps internal children out of the palette', () => {
    const payload: PagePayloadV5 = {
      version: 5,
      metadata: { documentTitle: 'V5 compound page' },
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
                id: 'quote',
                type: 'quote',
                props: { text: 'Ship it', cite: 'Team' },
                children: [],
              },
              {
                id: 'accordion',
                type: 'accordion',
                props: { allowMultiple: false },
                children: [
                  {
                    id: 'accordion-item',
                    type: 'accordion-item',
                    props: { title: 'Details', defaultOpen: true },
                    children: [
                      {
                        id: 'accordion-copy',
                        type: 'text',
                        props: { text: 'More information' },
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'tabs',
                type: 'tabs',
                props: { orientation: 'vertical' },
                children: [
                  {
                    id: 'tab-item',
                    type: 'tab-item',
                    props: { label: 'One' },
                    children: [
                      {
                        id: 'tab-copy',
                        type: 'text',
                        props: { text: 'Tab content' },
                        children: [],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'gallery',
                type: 'gallery',
                props: {},
                children: [
                  {
                    id: 'image',
                    type: 'image',
                    props: { src: '/assets/one.png', alt: 'One' },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const definition = payloadToEditorComponent(payload);
    expect(definition.attributes?.[BUILDER_PAYLOAD_VERSION_ATTRIBUTE]).toBe('5');
    const section = (definition.components as Array<Record<string, unknown>>)[0]!;
    const children = section.components as Array<Record<string, unknown>>;
    expect(
      children.map(
        (child) =>
          (child.attributes as Record<string, unknown> | undefined)?.[
            BUILDER_NODE_TYPE_ATTRIBUTE
          ],
      ),
    ).toEqual(['quote', 'accordion', 'tabs', 'gallery']);
    const accordion = children[1]!;
    const accordionItem = (accordion.components as Array<Record<string, unknown>>)[0]!;
    expect(
      (accordionItem.attributes as Record<string, unknown> | undefined)?.[
        BUILDER_COMPOUND_PROPS_ATTRIBUTE
      ],
    ).toContain('Details');
    expect(serializeEditorSnapshot(snapshotFromEditorDefinition(definition))).toEqual(
      payload,
    );

    const accordionDefinition = createBlockDefinition('accordion');
    expect(accordionDefinition.components).toHaveLength(2);
    expect(
      (
        (accordionDefinition.components as Array<Record<string, unknown>>)[0]!
          .attributes as Record<string, unknown> | undefined
      )?.[BUILDER_NODE_TYPE_ATTRIBUTE],
    ).toBe('accordion-item');
  });

  it('round-trips V6 accessibility props and registry-controlled part styles', () => {
    const payload: PagePayloadV6 = {
      version: 6,
      metadata: { documentTitle: 'V6 page' },
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
                id: 'tabs',
                type: 'tabs',
                props: {
                  orientation: 'vertical',
                  ariaLabel: 'Examples',
                  activationMode: 'manual',
                },
                partsStyle: {
                  tab: {
                    base: { backgroundColor: '#ffffff' },
                    mobile: { padding: '8px' },
                  },
                },
                children: [
                  {
                    id: 'tab',
                    type: 'tab-item',
                    props: { label: 'One' },
                    children: [
                      {
                        id: 'copy',
                        type: 'text',
                        props: { text: 'Content' },
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const definition = payloadToEditorComponent(payload);
    expect(definition.attributes?.[BUILDER_PAYLOAD_VERSION_ATTRIBUTE]).toBe('6');
    const section = (definition.components as Array<Record<string, unknown>>)[0]!;
    const tabs = (section.components as Array<Record<string, unknown>>)[0]!;
    expect(
      (tabs.attributes as Record<string, unknown> | undefined)?.[
        BUILDER_PARTS_STYLE_ATTRIBUTE
      ],
    ).toContain('backgroundColor');
    expect(serializeEditorSnapshot(snapshotFromEditorDefinition(definition))).toEqual(
      payload,
    );
  });

  it('round-trips a site header document through the same live editor adapter', () => {
    const global: SiteGlobalPayloadV1 = {
      version: 1,
      documentKind: 'site-header',
      metadata: { documentTitle: 'Site header' },
      root: {
        id: 'root',
        type: 'root',
        props: {},
        children: [
          {
            id: 'header',
            type: 'global-header',
            props: { position: 'sticky' },
            children: [
              {
                id: 'brand',
                type: 'site-brand',
                props: { display: 'logo-text', href: '/' },
                children: [],
              },
              {
                id: 'navigation',
                type: 'navigation-view',
                props: {
                  source: 'main',
                  orientation: 'horizontal',
                  mobileBehavior: 'collapse',
                  alignment: 'left',
                  ariaLabel: 'Main navigation',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };
    const definition = payloadToEditorComponent(global);
    const header = (definition.components as Array<Record<string, unknown>>)[0]!;
    expect(
      (header.attributes as Record<string, unknown>)[BUILDER_GLOBAL_PROPS_ATTRIBUTE],
    ).toContain('sticky');
    expect(
      serializeSiteGlobalSnapshot(
        snapshotFromEditorDefinition(definition),
        'site-header',
      ),
    ).toEqual(global);
  });

  it('recognizes extension nodes at the shared interaction boundary', () => {
    expect(isBuilderNodeType('extension')).toBe(true);
  });

  it('keeps inline editor content plain text at the payload boundary', () => {
    expect(sanitizeInlineText('<strong>Hello</strong>\u0000')).toBe('Hello');
  });

  it('remaps every definition id before a duplicated subtree enters the editor', () => {
    const section = {
      attributes: {
        [BUILDER_NODE_ID_ATTRIBUTE]: 'section-original',
        [BUILDER_NODE_TYPE_ATTRIBUTE]: 'section',
      },
      components: [
        {
          attributes: {
            [BUILDER_NODE_ID_ATTRIBUTE]: 'container-original',
            [BUILDER_NODE_TYPE_ATTRIBUTE]: 'container',
          },
          components: [
            {
              attributes: {
                [BUILDER_NODE_ID_ATTRIBUTE]: 'text-original',
                [BUILDER_NODE_TYPE_ATTRIBUTE]: 'text',
              },
            },
          ],
        },
      ],
    };
    const remapped = remapSubtreeNodeIds(section, new Set(['root', 'section-original']));
    const ids = [...collectPersistedNodeIds(remapped)];

    assertUniquePersistedNodeIds(remapped);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain('section-original');
    expect(ids).not.toContain('container-original');
    expect(ids).not.toContain('text-original');
    expect(new Set(ids).size).toBe(3);
  });
});
