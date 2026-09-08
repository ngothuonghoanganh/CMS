import type { ComponentDefinition } from 'grapesjs';
import type { ComponentBuilderPreview } from '@payload/contracts';

import {
  createBlockDefinition,
  openCompositionRecipeToEditorDefinition,
  type BuilderBlockType,
} from './builder-adapter';
import { resolveBuilderPreview } from './builder-preview-model';

export type BlockPresetId =
  | 'blank-section'
  | 'centered-section'
  | 'vertical-stack'
  | 'two-columns'
  | 'hero'
  | 'cta'
  | 'contact-form';

export type GlobalPresetId =
  | 'header-brand-menu-cta'
  | 'header-brand-menu'
  | 'footer-brand-menu'
  | 'footer-brand-menu-legal';

export type BuilderInsertable = BuilderBlockType | BlockPresetId | GlobalPresetId;

export type BuilderBlockDefinition =
  | {
      kind: 'component';
      id: string;
      type: Exclude<BuilderBlockType, 'extension'>;
      label: string;
      category: 'layout' | 'content' | 'conversion';
      keywords: readonly string[];
      description: string;
      preview: ComponentBuilderPreview;
    }
  | {
      kind: 'preset';
      id: BlockPresetId;
      label: string;
      category: 'layout' | 'content' | 'conversion';
      keywords: readonly string[];
      description: string;
      preview: ComponentBuilderPreview;
      create: () => ComponentDefinition;
    }
  | {
      kind: 'global-preset';
      id: GlobalPresetId;
      documentKind: 'site-header' | 'site-footer';
      label: string;
      category: 'layout';
      keywords: readonly string[];
      description: string;
      preview: ComponentBuilderPreview;
      applyMode: 'replace-root-children';
      create: () => ComponentDefinition;
    };

function children(
  parent: ComponentDefinition,
  components: ComponentDefinition[],
): ComponentDefinition {
  return { ...parent, components };
}

/** Built-in presets own structure, never brand/theme values. */
function structuralStyle(
  component: ComponentDefinition,
  style: Record<string, string>,
): ComponentDefinition {
  return { ...component, style: { ...(component.style ?? {}), ...style } };
}

function createBlankSection(): ComponentDefinition {
  return createBlockDefinition('section');
}

function createCenteredSection(): ComponentDefinition {
  return children(createBlockDefinition('section'), [createBlockDefinition('container')]);
}

function createVerticalStack(): ComponentDefinition {
  return children(createBlockDefinition('section'), [
    structuralStyle(createBlockDefinition('container'), {
      display: 'flex',
      'flex-direction': 'column',
    }),
  ]);
}

function createTwoColumns(): ComponentDefinition {
  const columns = structuralStyle(createBlockDefinition('container'), {
    display: 'grid',
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
  });
  return children(createBlockDefinition('section'), [
    children(columns, [
      createBlockDefinition('container'),
      createBlockDefinition('container'),
    ]),
  ]);
}

function createHero(): ComponentDefinition {
  const content = structuralStyle(createBlockDefinition('container'), {
    display: 'flex',
    'flex-direction': 'column',
  });
  return children(createBlockDefinition('section'), [
    children(content, [
      createBlockDefinition('heading', undefined, { headingLevel: 1 }),
      createBlockDefinition('text'),
      structuralStyle(createBlockDefinition('button'), { width: 'fit-content' }),
    ]),
  ]);
}

function createCta(): ComponentDefinition {
  const content = structuralStyle(createBlockDefinition('container'), {
    display: 'flex',
    'flex-direction': 'column',
    'align-items': 'center',
  });
  return children(createBlockDefinition('section'), [
    children(content, [
      createBlockDefinition('heading'),
      createBlockDefinition('text'),
      createBlockDefinition('button', undefined, { buttonVariant: 'primary' }),
    ]),
  ]);
}

function createContactForm(): ComponentDefinition {
  return openCompositionRecipeToEditorDefinition('contact-form');
}

export const BUILDER_BLOCK_PRESET_REGISTRY: readonly Extract<
  BuilderBlockDefinition,
  { kind: 'preset' }
>[] = [
  {
    kind: 'preset',
    id: 'blank-section',
    label: 'Blank Section',
    category: 'layout',
    keywords: ['section', 'blank', 'layout'],
    description: 'Start with an empty section for a custom composition.',
    preview: resolveBuilderPreview(createBlankSection(), 'blank-section'),
    create: createBlankSection,
  },
  {
    kind: 'preset',
    id: 'centered-section',
    label: 'Centered Section',
    category: 'layout',
    keywords: ['section', 'center', 'container'],
    description: 'A centered content container with a comfortable reading width.',
    preview: resolveBuilderPreview(createCenteredSection(), 'centered-section'),
    create: createCenteredSection,
  },
  {
    kind: 'preset',
    id: 'vertical-stack',
    label: 'Vertical Stack',
    category: 'layout',
    keywords: ['stack', 'vertical', 'layout', 'flex'],
    description: 'A vertical content stack with consistent spacing.',
    preview: resolveBuilderPreview(createVerticalStack(), 'vertical-stack'),
    create: createVerticalStack,
  },
  {
    kind: 'preset',
    id: 'two-columns',
    label: 'Two Columns',
    category: 'layout',
    keywords: ['columns', 'grid', 'layout'],
    description: 'A responsive two-column grid for side-by-side content.',
    preview: resolveBuilderPreview(createTwoColumns(), 'two-columns'),
    create: createTwoColumns,
  },
  {
    kind: 'preset',
    id: 'hero',
    label: 'Hero',
    category: 'layout',
    keywords: ['hero', 'heading', 'cta', 'section'],
    description: 'A prominent hero section with heading, copy, and call to action.',
    preview: resolveBuilderPreview(createHero(), 'hero'),
    create: createHero,
  },
  {
    kind: 'preset',
    id: 'cta',
    label: 'CTA',
    category: 'layout',
    keywords: ['cta', 'call to action', 'button', 'section'],
    description: 'A focused conversion section with supporting copy and a button.',
    preview: resolveBuilderPreview(createCta(), 'cta'),
    create: createCta,
  },
  {
    kind: 'preset',
    id: 'contact-form',
    label: 'Contact Form',
    category: 'conversion',
    keywords: ['form', 'contact', 'fields', 'conversion', 'recipe'],
    description: 'A composable form with editable fields and a submit action.',
    preview: resolveBuilderPreview(createContactForm(), 'contact-form'),
    create: createContactForm,
  },
];

function createHeaderPreset(withCta: boolean): ComponentDefinition {
  const header = createBlockDefinition('global-header');
  const children = [
    createBlockDefinition('site-brand'),
    createBlockDefinition('navigation-view'),
  ];
  if (withCta)
    children.push(
      createBlockDefinition('button', undefined, { buttonVariant: 'primary' }),
    );
  return childrenForGlobal(header, children);
}

function createFooterPreset(withLegal: boolean): ComponentDefinition {
  const footer = createBlockDefinition('global-footer');
  const children = [
    createBlockDefinition('site-brand'),
    createBlockDefinition('navigation-view'),
  ];
  if (withLegal) children.push(createBlockDefinition('text'));
  return childrenForGlobal(footer, children);
}

function childrenForGlobal(
  parent: ComponentDefinition,
  components: ComponentDefinition[],
): ComponentDefinition {
  return children(parent, components);
}

export const GLOBAL_HEADER_PRESET_REGISTRY: readonly Extract<
  BuilderBlockDefinition,
  { kind: 'global-preset' }
>[] = [
  {
    kind: 'global-preset',
    id: 'header-brand-menu-cta',
    documentKind: 'site-header',
    label: 'Brand · Menu · CTA',
    category: 'layout',
    keywords: ['header', 'brand', 'menu', 'cta'],
    description: 'Replace the header content with brand, navigation, and a CTA.',
    preview: resolveBuilderPreview(createHeaderPreset(true), 'header-brand-menu-cta'),
    applyMode: 'replace-root-children',
    create: () => createHeaderPreset(true),
  },
  {
    kind: 'global-preset',
    id: 'header-brand-menu',
    documentKind: 'site-header',
    label: 'Brand · Menu',
    category: 'layout',
    keywords: ['header', 'brand', 'menu'],
    description: 'Replace the header content with brand and navigation.',
    preview: resolveBuilderPreview(createHeaderPreset(false), 'header-brand-menu'),
    applyMode: 'replace-root-children',
    create: () => createHeaderPreset(false),
  },
];

export const GLOBAL_FOOTER_PRESET_REGISTRY: readonly Extract<
  BuilderBlockDefinition,
  { kind: 'global-preset' }
>[] = [
  {
    kind: 'global-preset',
    id: 'footer-brand-menu',
    documentKind: 'site-footer',
    label: 'Brand · Menu',
    category: 'layout',
    keywords: ['footer', 'brand', 'menu'],
    description: 'Replace the footer content with brand and navigation.',
    preview: resolveBuilderPreview(createFooterPreset(false), 'footer-brand-menu'),
    applyMode: 'replace-root-children',
    create: () => createFooterPreset(false),
  },
  {
    kind: 'global-preset',
    id: 'footer-brand-menu-legal',
    documentKind: 'site-footer',
    label: 'Brand · Menu · Legal',
    category: 'layout',
    keywords: ['footer', 'brand', 'menu', 'legal'],
    description: 'Replace the footer content with brand, navigation, and legal copy.',
    preview: resolveBuilderPreview(createFooterPreset(true), 'footer-brand-menu-legal'),
    applyMode: 'replace-root-children',
    create: () => createFooterPreset(true),
  },
];

export const GLOBAL_PRESET_REGISTRY = [
  ...GLOBAL_HEADER_PRESET_REGISTRY,
  ...GLOBAL_FOOTER_PRESET_REGISTRY,
] as const;

export function getBlockPreset(
  id: BlockPresetId,
): Extract<BuilderBlockDefinition, { kind: 'preset' }> {
  const definition = BUILDER_BLOCK_PRESET_REGISTRY.find(
    (candidate): candidate is Extract<BuilderBlockDefinition, { kind: 'preset' }> =>
      candidate.kind === 'preset' && candidate.id === id,
  );
  if (!definition) throw new Error(`Unknown builder preset: ${id}`);
  return definition;
}

export function createBlockPresetDefinition(id: BlockPresetId): ComponentDefinition {
  return getBlockPreset(id).create();
}

export function isGlobalPresetId(value: string): value is GlobalPresetId {
  return GLOBAL_PRESET_REGISTRY.some((candidate) => candidate.id === value);
}

export function createGlobalPresetDefinition(id: GlobalPresetId): ComponentDefinition {
  const definition = GLOBAL_PRESET_REGISTRY.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown global preset: ${id}`);
  return definition.create();
}
