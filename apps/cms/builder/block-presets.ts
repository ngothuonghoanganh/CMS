import type { ComponentDefinition } from 'grapesjs';

import { createBlockDefinition, type BuilderBlockType } from './builder-adapter';

export type BlockPresetId =
  | 'blank-section'
  | 'centered-section'
  | 'vertical-stack'
  | 'two-columns'
  | 'hero'
  | 'cta';

export type BuilderInsertable = BuilderBlockType | BlockPresetId;

export type BuilderBlockDefinition =
  | {
      kind: 'component';
      id: string;
      type: Exclude<BuilderBlockType, 'extension'>;
      label: string;
      category: 'layout' | 'content' | 'conversion';
      keywords: readonly string[];
    }
  | {
      kind: 'preset';
      id: BlockPresetId;
      label: string;
      category: 'layout';
      keywords: readonly string[];
      create: () => ComponentDefinition;
    };

function children(
  parent: ComponentDefinition,
  components: ComponentDefinition[],
): ComponentDefinition {
  return { ...parent, components };
}

function styled(
  component: ComponentDefinition,
  style: Record<string, string>,
): ComponentDefinition {
  return { ...component, style: { ...(component.style ?? {}), ...style } };
}

function createBlankSection(): ComponentDefinition {
  return createBlockDefinition('section');
}

function createCenteredSection(): ComponentDefinition {
  return children(createBlockDefinition('section'), [
    styled(createBlockDefinition('container'), {
      width: '100%',
      'max-width': '1120px',
      margin: '0 auto',
    }),
  ]);
}

function createVerticalStack(): ComponentDefinition {
  return children(createBlockDefinition('section'), [
    styled(createBlockDefinition('container'), {
      display: 'flex',
      'flex-direction': 'column',
      gap: '24px',
    }),
  ]);
}

function createTwoColumns(): ComponentDefinition {
  const columns = styled(createBlockDefinition('container'), {
    display: 'grid',
    'grid-template-columns': 'repeat(2, minmax(0, 1fr))',
    gap: '32px',
  });
  return children(createBlockDefinition('section'), [
    children(columns, [
      createBlockDefinition('container'),
      createBlockDefinition('container'),
    ]),
  ]);
}

function createHero(): ComponentDefinition {
  const content = styled(createBlockDefinition('container'), {
    display: 'flex',
    'flex-direction': 'column',
    gap: '20px',
    'max-width': '720px',
  });
  return children(
    styled(createBlockDefinition('section'), {
      padding: '64px 24px',
      'background-color': '#eff6ff',
    }),
    [
      children(content, [
        styled(createBlockDefinition('heading'), {
          'font-size': '48px',
          'font-weight': '700',
          'line-height': '1.1',
        }),
        createBlockDefinition('text'),
        styled(createBlockDefinition('button'), {
          width: 'fit-content',
          padding: '12px 18px',
        }),
      ]),
    ],
  );
}

function createCta(): ComponentDefinition {
  const content = styled(createBlockDefinition('container'), {
    display: 'flex',
    'flex-direction': 'column',
    gap: '16px',
    'align-items': 'center',
    padding: '48px 24px',
  });
  return children(createBlockDefinition('section'), [
    children(content, [
      createBlockDefinition('heading'),
      createBlockDefinition('text'),
      styled(createBlockDefinition('button'), { padding: '12px 18px' }),
    ]),
  ]);
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
    create: createBlankSection,
  },
  {
    kind: 'preset',
    id: 'centered-section',
    label: 'Centered Section',
    category: 'layout',
    keywords: ['section', 'center', 'container'],
    create: createCenteredSection,
  },
  {
    kind: 'preset',
    id: 'vertical-stack',
    label: 'Vertical Stack',
    category: 'layout',
    keywords: ['stack', 'vertical', 'layout', 'flex'],
    create: createVerticalStack,
  },
  {
    kind: 'preset',
    id: 'two-columns',
    label: 'Two Columns',
    category: 'layout',
    keywords: ['columns', 'grid', 'layout'],
    create: createTwoColumns,
  },
  {
    kind: 'preset',
    id: 'hero',
    label: 'Hero',
    category: 'layout',
    keywords: ['hero', 'heading', 'cta', 'section'],
    create: createHero,
  },
  {
    kind: 'preset',
    id: 'cta',
    label: 'CTA',
    category: 'layout',
    keywords: ['cta', 'call to action', 'button', 'section'],
    create: createCta,
  },
];

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
