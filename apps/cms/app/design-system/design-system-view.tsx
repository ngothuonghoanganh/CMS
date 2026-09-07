'use client';

import {
  SiteDesignSystemResponseSchema,
  PAGE_COMPONENT_REGISTRY,
  createDefaultSiteDesignSystem,
  normalizeSiteDesignSystemOverride,
  resolveDesignSystemComponentDefaults,
  resolvePageStyleValue,
  resolveDesignSystemColorRole,
  isSafePageStyleValue,
  type DesignScalarToken,
  type PageNodeStyleV7,
  type SiteDesignSystem,
  type StyleTokenReference,
  type TypographyToken,
} from '@payload/contracts';
import { type CSSProperties, useEffect, useState } from 'react';

import { ApiClientError, api } from '../lib/api';
import { ColorField } from '../ui/fields';

type DesignSystemViewProps = {
  workspaceId: string;
  siteId?: string;
  canUpdate: boolean;
  inheritedSiteCount?: number;
  siteName?: string;
  siteLogo?: string | undefined;
  siteStatus?: 'draft' | 'published' | 'archived' | undefined;
};

const scalarCategories = [
  ['colors', 'Colors'],
  ['spacing', 'Spacing'],
  ['radii', 'Radius'],
  ['shadows', 'Shadows'],
  ['containerWidths', 'Container widths'],
] as const;

type ComponentStyleProperty = keyof PageNodeStyleV7['base'];

function typographyFieldLabel(field: string): string {
  return (
    (
      {
        fontFamily: 'Font family',
        fontSize: 'Font size',
        fontWeight: 'Font weight',
        lineHeight: 'Line height',
        letterSpacing: 'Letter spacing',
      } as Record<string, string>
    )[field] ?? field
  );
}

const designSystemComponentEntries = Object.values(PAGE_COMPONENT_REGISTRY).filter(
  (definition) => definition.designSystem,
);

const componentDefaultFields: Record<
  string,
  readonly { property: ComponentStyleProperty; label: string }[]
> = Object.fromEntries(
  designSystemComponentEntries.map((definition) => [
    definition.type,
    definition.designSystem!.controls.map((property) => ({
      property: property.replace(/-([a-z])/g, (_, character: string) =>
        character.toUpperCase(),
      ) as ComponentStyleProperty,
      label: property
        .replace(
          /(^|-)([a-z])/g,
          (_, _separator: string, character: string) => ` ${character.toUpperCase()}`,
        )
        .trim(),
    })),
  ]),
);

const componentTokenCategories: Partial<
  Record<ComponentStyleProperty, (typeof scalarCategories)[number][0] | 'typography'>
> = {
  backgroundColor: 'colors',
  borderRadius: 'radii',
  color: 'colors',
  fontFamily: 'typography',
  fontSize: 'typography',
  fontWeight: 'typography',
  gap: 'spacing',
  lineHeight: 'typography',
  padding: 'spacing',
};

function stylePropertyName(property: ComponentStyleProperty): string {
  return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function tokenValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof value === 'object' &&
    'kind' in value &&
    value.kind === 'token' &&
    'tokenId' in value &&
    typeof value.tokenId === 'string'
  ) {
    return `token:${value.tokenId}`;
  }
  return '';
}

function tokenOptions(
  system: SiteDesignSystem,
  property: ComponentStyleProperty,
): { id: string; label: string }[] {
  const category = componentTokenCategories[property];
  if (!category) return [];
  if (category === 'typography') {
    return system.typography.map((token) => ({ id: token.id, label: token.name }));
  }
  return system[category].map((token) => ({ id: token.id, label: token.name }));
}

function selectedStyleValue(value: string): string | StyleTokenReference {
  if (value.startsWith('token:')) {
    return { kind: 'token', tokenId: value.slice('token:'.length) };
  }
  return value;
}

function componentRecipeKey(componentType: string, variantId: string): string {
  if (variantId === 'base') return componentType;
  if (componentType === 'heading') return variantId;
  if (componentType === 'text' && variantId === 'body') return 'text';
  return `${componentType}-${variantId}`;
}

export function updateComponentDefault(
  system: SiteDesignSystem,
  componentType: string,
  property: ComponentStyleProperty,
  value: string | StyleTokenReference | undefined,
  viewport: 'base' | 'tablet' | 'mobile' = 'base',
): SiteDesignSystem {
  const current = system.componentDefaults?.[componentType];
  const styleBlock: PageNodeStyleV7['base'] = {
    ...(current?.style?.[viewport] ?? {}),
  };
  if (value === undefined) delete styleBlock[property];
  else
    (
      styleBlock as Record<
        ComponentStyleProperty,
        string | StyleTokenReference | undefined
      >
    )[property] = value;
  const nextStyle: PageNodeStyleV7 = {
    ...(current?.style ?? {}),
    base: current?.style?.base ?? {},
  };
  if (viewport === 'base') nextStyle.base = styleBlock;
  if (viewport === 'tablet') nextStyle.tablet = styleBlock;
  if (viewport === 'mobile') nextStyle.mobile = styleBlock;
  return {
    ...system,
    componentDefaults: {
      ...(system.componentDefaults ?? {}),
      [componentType]: {
        ...(current ?? {}),
        style: nextStyle,
      },
    },
  };
}

export function updateComponentPartDefault(
  system: SiteDesignSystem,
  componentType: string,
  part: string,
  property: ComponentStyleProperty,
  value: string | StyleTokenReference | undefined,
  viewport: 'base' | 'tablet' | 'mobile' = 'base',
): SiteDesignSystem {
  const current = system.componentDefaults?.[componentType];
  const currentPart = current?.partsStyle?.[part];
  const styleBlock: PageNodeStyleV7['base'] = {
    ...(currentPart?.[viewport] ?? {}),
  };
  if (value === undefined) delete styleBlock[property];
  else
    (
      styleBlock as Record<
        ComponentStyleProperty,
        string | StyleTokenReference | undefined
      >
    )[property] = value;
  const nextPart: PageNodeStyleV7 = {
    ...(currentPart ?? {}),
    base: currentPart?.base ?? {},
  };
  if (viewport === 'base') nextPart.base = styleBlock;
  if (viewport === 'tablet') nextPart.tablet = styleBlock;
  if (viewport === 'mobile') nextPart.mobile = styleBlock;
  return {
    ...system,
    componentDefaults: {
      ...(system.componentDefaults ?? {}),
      [componentType]: {
        ...(current ?? {}),
        partsStyle: {
          ...(current?.partsStyle ?? {}),
          [part]: nextPart,
        },
      },
    },
  };
}

function resetComponentDefault(
  system: SiteDesignSystem,
  componentType: string,
): SiteDesignSystem {
  const componentDefaults = { ...(system.componentDefaults ?? {}) };
  delete componentDefaults[componentType];
  return {
    ...system,
    ...(Object.keys(componentDefaults).length
      ? { componentDefaults }
      : { componentDefaults: undefined }),
  };
}

export function resolveComponentDefaultStyle(
  system: SiteDesignSystem,
  componentType: string,
): CSSProperties {
  const base = resolveDesignSystemComponentDefaults(system, componentType)?.style?.base;
  if (!base) return {};
  const resolved: Record<string, string> = {};
  for (const [property, value] of Object.entries(base)) {
    if (typeof value !== 'string' && (!value || value.kind !== 'token')) continue;
    const cssValue = resolvePageStyleValue(
      value as string | StyleTokenReference,
      system,
      stylePropertyName(property as ComponentStyleProperty),
    );
    if (cssValue !== undefined) resolved[property] = cssValue;
  }
  return resolved as CSSProperties;
}

export function resolveComponentDefaultPartStyle(
  system: SiteDesignSystem,
  componentType: string,
  part: string,
): CSSProperties {
  const base = resolveDesignSystemComponentDefaults(system, componentType)?.partsStyle?.[
    part
  ]?.base;
  if (!base) return {};
  const resolved: Record<string, string> = {};
  for (const [property, value] of Object.entries(base)) {
    if (typeof value !== 'string' && (!value || value.kind !== 'token')) continue;
    const cssValue = resolvePageStyleValue(
      value as string | StyleTokenReference,
      system,
      stylePropertyName(property as ComponentStyleProperty),
    );
    if (cssValue !== undefined) resolved[property] = cssValue;
  }
  return resolved as CSSProperties;
}

type PreviewDevice = 'desktop' | 'mobile';
type PreviewPage = 'home' | 'services' | 'contact';

type WebsitePreviewProps = {
  device: PreviewDevice;
  headingStyle: CSSProperties;
  bodyStyle: CSSProperties;
  buttonStyle: CSSProperties;
  secondaryButtonStyle: CSSProperties;
  formStyle: CSSProperties;
  formInputStyle: CSSProperties;
  colors: {
    pageBackground: string;
    primary: string;
    surface: string;
    text: string;
    muted: string;
  };
  radius: string;
  shadow: string;
  spacing: string;
  contrast: number | undefined;
  siteLogo?: string | undefined;
  siteName: string;
  page: PreviewPage;
  onDeviceChange: (device: PreviewDevice) => void;
  onPageChange: (page: PreviewPage) => void;
};

function previewTokenValue(
  system: SiteDesignSystem,
  role: Parameters<typeof resolveDesignSystemColorRole>[1],
  fallback: string,
): string {
  const value = resolveDesignSystemColorRole(system, role);
  return value && isSafePageStyleValue(value) ? value : fallback;
}

function previewScalarValue(
  system: SiteDesignSystem,
  category: 'spacing' | 'radii' | 'shadows',
  tokenIds: readonly string[],
  fallback: string,
): string {
  const token = system[category].find((candidate) => tokenIds.includes(candidate.id));
  return token?.value && isSafePageStyleValue(token.value) ? token.value : fallback;
}

function isPreviewImageSource(source: string | undefined): source is string {
  return Boolean(source && (/^https?:\/\//i.test(source) || source.startsWith('/api/')));
}

function previewInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'Y'
  );
}

function hexColorRgb(value: string): [number, number, number] | undefined {
  const normalized = value.trim().replace(/^#/, '');
  if (!/^[\da-f]{6}$/i.test(normalized)) return undefined;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function contrastRatio(foreground: string, background: string): number | undefined {
  const foregroundRgb = hexColorRgb(foreground);
  const backgroundRgb = hexColorRgb(background);
  if (!foregroundRgb || !backgroundRgb) return undefined;
  const luminance = (rgb: [number, number, number]) => {
    const channels = rgb
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return (
      0.2126 * (channels[0] ?? 0) +
      0.7152 * (channels[1] ?? 0) +
      0.0722 * (channels[2] ?? 0)
    );
  };
  const lighter = Math.max(luminance(foregroundRgb), luminance(backgroundRgb));
  const darker = Math.min(luminance(foregroundRgb), luminance(backgroundRgb));
  return (lighter + 0.05) / (darker + 0.05);
}

function WebsitePreview({
  bodyStyle,
  buttonStyle,
  secondaryButtonStyle,
  formStyle,
  formInputStyle,
  colors,
  contrast,
  device,
  headingStyle,
  onDeviceChange,
  onPageChange,
  page,
  radius,
  shadow,
  siteLogo,
  siteName,
  spacing,
}: WebsitePreviewProps) {
  const pageContent: Record<
    PreviewPage,
    { eyebrow: string; title: string; description: string }
  > = {
    home: {
      eyebrow: `Welcome to ${siteName}`,
      title: 'Make your next idea easier to find.',
      description:
        'A flexible starting point for your story, your offer, and the people you want to reach.',
    },
    services: {
      eyebrow: 'Services',
      title: 'Everything you need to move forward.',
      description:
        'Show visitors what you do with clear sections, confident type, and a consistent visual voice.',
    },
    contact: {
      eyebrow: 'Contact',
      title: 'Let’s make something useful together.',
      description: 'A warm, focused contact experience that makes the next step obvious.',
    },
  };
  const content = pageContent[page];
  const previewVariables = {
    '--brand-primary': colors.primary,
    '--brand-page-background': colors.pageBackground,
    '--brand-surface': colors.surface,
    '--brand-text': colors.text,
    '--brand-muted': colors.muted,
    '--brand-radius': radius,
    '--brand-shadow': shadow,
    '--brand-space': spacing,
  } as CSSProperties;
  const logoSource = isPreviewImageSource(siteLogo) ? siteLogo : undefined;

  return (
    <section
      className="design-system-preview panel"
      aria-labelledby="website-preview-title"
    >
      <div className="design-system-preview-heading">
        <div>
          <span className="eyebrow">See the result</span>
          <h2 id="website-preview-title">Preview your website</h2>
          <p className="muted">
            Edit a value below and this preview updates immediately. These are draft
            styles for your website — the CMS interface stays unchanged.
          </p>
        </div>
        <span className="design-system-preview-status is-draft" role="status">
          Draft preview
        </span>
      </div>
      <div className="design-system-preview-toolbar">
        <div
          aria-label="Preview pages"
          className="design-system-preview-tabs"
          role="tablist"
        >
          {(
            [
              ['home', 'Home'],
              ['services', 'Services'],
              ['contact', 'Contact'],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-selected={page === value}
              className={page === value ? 'is-active' : ''}
              key={value}
              onClick={() => onPageChange(value)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div aria-label="Preview size" className="design-system-preview-device-toggle">
          <button
            aria-pressed={device === 'desktop'}
            className={device === 'desktop' ? 'is-active' : ''}
            onClick={() => onDeviceChange('desktop')}
            type="button"
          >
            Desktop
          </button>
          <button
            aria-pressed={device === 'mobile'}
            className={device === 'mobile' ? 'is-active' : ''}
            onClick={() => onDeviceChange('mobile')}
            type="button"
          >
            Mobile
          </button>
        </div>
      </div>
      <div className="design-system-preview-impact" aria-label="What each style changes">
        <span>
          <i className="design-system-impact-dot is-primary" />
          Primary color → buttons, links, and highlights
        </span>
        <span>
          <i className="design-system-impact-dot is-text" />
          Text color → headings and body copy
        </span>
        <span>
          <i className="design-system-impact-dot is-surface" />
          Surface color → cards, forms, and secondary surfaces
        </span>
      </div>
      {contrast !== undefined && contrast < 4.5 ? (
        <div className="design-system-preview-warning" role="status">
          <strong>Text may be hard to read.</strong>
          <span>
            These colors have a {contrast.toFixed(1)}:1 contrast ratio. Try a darker text
            color before publishing.
          </span>
        </div>
      ) : null}
      <div className="design-system-preview-stage">
        <div
          className={`design-system-website-frame${device === 'mobile' ? ' is-mobile' : ''}`}
          style={previewVariables}
        >
          <div className="site-preview-browser-bar" aria-hidden="true">
            <span />
            <span />
            <span />
            <small>{siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.com</small>
          </div>
          <div
            className="site-preview-page"
            style={{ backgroundColor: 'var(--brand-page-background)' }}
          >
            <header className="site-preview-header">
              <div className="site-preview-brand">
                {logoSource ? (
                  <img alt="" src={logoSource} />
                ) : (
                  <span className="site-preview-logo-fallback">
                    {previewInitials(siteName)}
                  </span>
                )}
                <strong>{siteName}</strong>
              </div>
              <nav aria-label="Website preview navigation" className="site-preview-nav">
                <button type="button">Home</button>
                <button type="button">Services</button>
                <button type="button">Contact</button>
                <button
                  className="site-preview-nav-cta"
                  style={buttonStyle}
                  type="button"
                >
                  Get started
                </button>
              </nav>
              <button
                aria-label="Open website menu"
                className="site-preview-menu"
                type="button"
              >
                Menu
              </button>
            </header>
            <main>
              <section className="site-preview-hero">
                <div className="site-preview-hero-copy">
                  <span className="site-preview-eyebrow">{content.eyebrow}</span>
                  <h1 style={headingStyle}>{content.title}</h1>
                  <p style={bodyStyle}>{content.description}</p>
                  <div className="site-preview-actions">
                    <button style={buttonStyle} type="button">
                      Start a project
                    </button>
                    <button
                      className="site-preview-secondary-button"
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      See how it works
                    </button>
                  </div>
                  <div className="site-preview-stats">
                    <span>
                      <strong>24/7</strong>
                      Support
                    </span>
                    <span>
                      <strong>3×</strong>
                      Clearer path
                    </span>
                    <span>
                      <strong>1</strong>
                      Shared style
                    </span>
                  </div>
                </div>
                <div className="site-preview-hero-art" aria-hidden="true">
                  <div className="site-preview-art-window">
                    <span />
                    <span />
                    <span />
                    <div className="site-preview-art-line" />
                    <div className="site-preview-art-card" />
                  </div>
                </div>
              </section>
              <section className="site-preview-trust-row" aria-label="Example trust row">
                <span>Trusted by thoughtful teams</span>
                <strong>northstar</strong>
                <strong>Fieldnote</strong>
                <strong>Goodform</strong>
                <strong>Commonplace</strong>
              </section>
              <section className="site-preview-services">
                <div className="site-preview-section-heading">
                  <div>
                    <span className="site-preview-eyebrow">What you can show</span>
                    <h2 style={headingStyle}>A website with room to grow.</h2>
                  </div>
                  <p style={bodyStyle}>
                    New sections inherit these same styles automatically.
                  </p>
                </div>
                <div className="site-preview-service-grid">
                  {[
                    ['01', 'Strategy', 'Turn a big idea into a clear next step.'],
                    ['02', 'Design', 'Make every detail feel like it belongs together.'],
                    ['03', 'Launch', 'Publish confidently when everything is ready.'],
                  ].map(([number, title, description]) => (
                    <article className="site-preview-service-card" key={number}>
                      <span>{number}</span>
                      <h3>{title}</h3>
                      <p style={bodyStyle}>{description}</p>
                      <button type="button">Learn more →</button>
                    </article>
                  ))}
                </div>
              </section>
              <section className="site-preview-proof-section">
                <div className="site-preview-testimonial">
                  <span className="site-preview-eyebrow">A real website moment</span>
                  <blockquote>
                    “The site finally feels like us — clear, warm, and ready to share.”
                  </blockquote>
                  <span className="site-preview-person">Jordan Lee · Founder</span>
                </div>
                <div className="site-preview-contact-card" style={formStyle}>
                  <span className="site-preview-eyebrow">Contact form</span>
                  <h3>Start a conversation.</h3>
                  <label>
                    Name
                    <input placeholder="Your name" readOnly style={formInputStyle} />
                  </label>
                  <label>
                    Email
                    <input
                      placeholder="you@example.com"
                      readOnly
                      style={formInputStyle}
                    />
                  </label>
                  <button style={buttonStyle} type="button">
                    Send message
                  </button>
                </div>
              </section>
            </main>
            <footer className="site-preview-footer">
              <div className="site-preview-brand">
                <span className="site-preview-logo-fallback">
                  {previewInitials(siteName)}
                </span>
                <strong>{siteName}</strong>
              </div>
              <span>© 2026 {siteName}. Built with intention.</span>
            </footer>
          </div>
        </div>
      </div>
    </section>
  );
}

function updateScalar(
  system: SiteDesignSystem,
  category: (typeof scalarCategories)[number][0],
  id: string,
  field: 'name' | 'value',
  value: string,
): SiteDesignSystem {
  return {
    ...system,
    [category]: system[category].map((token) =>
      token.id === id ? { ...token, [field]: value } : token,
    ),
  };
}

function updateTypography(
  system: SiteDesignSystem,
  id: string,
  field: keyof TypographyToken,
  value: string,
): SiteDesignSystem {
  return {
    ...system,
    typography: system.typography.map((token) =>
      token.id === id ? { ...token, [field]: value || undefined } : token,
    ),
  };
}

function nextTokenId(prefix: string, system: SiteDesignSystem): string {
  const used = new Set(
    [
      ...system.colors,
      ...system.typography,
      ...system.spacing,
      ...system.radii,
      ...system.shadows,
      ...system.containerWidths,
    ].map((token) => token.id),
  );
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now()}`;
  let candidate = `${prefix}-${random}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${prefix}-${random}-${suffix++}`;
  return candidate;
}

function addScalar(
  system: SiteDesignSystem,
  category: (typeof scalarCategories)[number][0],
): SiteDesignSystem {
  const defaults: Record<typeof category, string> = {
    colors: '#64748b',
    spacing: '16px',
    radii: '8px',
    shadows: '0 4px 12px rgba(15, 23, 42, .12)',
    containerWidths: '960px',
  };
  const prefix = category === 'containerWidths' ? 'container' : category.slice(0, -1);
  return {
    ...system,
    [category]: [
      ...system[category],
      { id: nextTokenId(prefix, system), name: 'New token', value: defaults[category] },
    ],
  };
}

function addTypography(system: SiteDesignSystem): SiteDesignSystem {
  return {
    ...system,
    typography: [
      ...system.typography,
      {
        id: nextTokenId('type', system),
        name: 'New text style',
        fontSize: '16px',
        lineHeight: '1.5',
      },
    ],
  };
}

export function DesignSystemView({
  workspaceId,
  siteId,
  canUpdate,
  inheritedSiteCount,
  siteLogo,
  siteName = 'Your website',
  siteStatus,
}: DesignSystemViewProps) {
  const [system, setSystem] = useState<SiteDesignSystem | null>(null);
  const [workspaceSystem, setWorkspaceSystem] = useState<SiteDesignSystem | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [publishedFingerprint, setPublishedFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('desktop');
  const [previewPage, setPreviewPage] = useState<PreviewPage>('home');
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [selectedTypographyId, setSelectedTypographyId] = useState<string | null>(null);
  const [selectedComponentType, setSelectedComponentType] = useState<string | null>(null);
  const [selectedComponentPart, setSelectedComponentPart] = useState<string | null>(null);
  const [componentViewport, setComponentViewport] = useState<
    'base' | 'tablet' | 'mobile'
  >('base');
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<
    | 'overview'
    | 'components'
    | 'buttons'
    | 'forms'
    | 'typography'
    | (typeof scalarCategories)[number][0]
  >('overview');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const siteRequest = api.get(
      siteId
        ? `/workspaces/${workspaceId}/sites/${siteId}/design-system`
        : `/workspaces/${workspaceId}/design-system`,
    );
    const workspaceRequest = siteId
      ? api.get(`/workspaces/${workspaceId}/design-system`)
      : Promise.resolve(undefined);
    void Promise.all([siteRequest, workspaceRequest])
      .then(([response, baseline]) => {
        if (cancelled) return;
        const parsed = SiteDesignSystemResponseSchema.parse(response);
        setSystem(parsed.draft);
        setSavedFingerprint(JSON.stringify(parsed.draft));
        setPublishedFingerprint(
          parsed.published ? JSON.stringify(parsed.published) : null,
        );
        setWorkspaceSystem(
          baseline ? SiteDesignSystemResponseSchema.parse(baseline).draft : null,
        );
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        if (!(caughtError instanceof ApiClientError && caughtError.status === 404)) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Design system could not load.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, workspaceId]);

  async function save() {
    if (!system || !canUpdate) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = siteId
        ? {
            override: normalizeSiteDesignSystemOverride(
              workspaceSystem ?? createDefaultSiteDesignSystem(),
              system,
            ),
          }
        : system;
      const next = SiteDesignSystemResponseSchema.parse(
        await api.patch(
          siteId
            ? `/workspaces/${workspaceId}/sites/${siteId}/design-system`
            : `/workspaces/${workspaceId}/design-system`,
          body,
        ),
      ).draft;
      setSystem(next);
      setSavedFingerprint(JSON.stringify(next));
      setNotice(
        siteId
          ? 'Site design system draft saved.'
          : 'Workspace defaults saved as a draft. Publish them when you are ready.',
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Design system could not save.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishSite() {
    if (!siteId || !canUpdate || !system || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/workspaces/${workspaceId}/sites/${siteId}/design-system/publish`, {
        designSystem: system,
      });
      const refreshed = SiteDesignSystemResponseSchema.parse(
        await api.get(`/workspaces/${workspaceId}/sites/${siteId}/design-system`),
      );
      setSystem(refreshed.draft);
      setSavedFingerprint(JSON.stringify(refreshed.draft));
      setPublishedFingerprint(
        refreshed.published ? JSON.stringify(refreshed.published) : null,
      );
      setNotice('Website styles published immediately.');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Website styles could not be published.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function publishWorkspace() {
    if (!system || siteId || !canUpdate || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const refreshed = SiteDesignSystemResponseSchema.parse(
        await api.post(`/workspaces/${workspaceId}/design-system/publish`, {
          designSystem: system,
        }),
      );
      setSystem(refreshed.draft);
      setSavedFingerprint(JSON.stringify(refreshed.draft));
      setPublishedFingerprint(
        refreshed.published ? JSON.stringify(refreshed.published) : null,
      );
      setNotice('Workspace defaults published to your websites.');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Brand styles could not be published.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <section className="panel">
        <p>Loading design system…</p>
      </section>
    );
  if (!system)
    return (
      <section className="panel">
        <p className="alert-error">{error ?? 'Design system unavailable.'}</p>
      </section>
    );

  const primaryColor = previewTokenValue(system, 'primary', '#2563eb');
  const surfaceColor = previewTokenValue(system, 'surface', '#ffffff');
  const textColor = previewTokenValue(system, 'text', '#111827');
  const mutedColor = previewTokenValue(system, 'mutedText', '#6b7280');
  const pageBackgroundColor = previewTokenValue(system, 'pageBackground', '#ffffff');
  const headingStyle = system.typography.find((token) => token.id === 'type-h2');
  const headingOneStyle = system.typography.find((token) => token.id === 'type-h1');
  const bodyStyle = system.typography.find((token) => token.id === 'type-body');
  const headingDefaultStyle = resolveComponentDefaultStyle(system, 'heading-1');
  const bodyDefaultStyle = resolveComponentDefaultStyle(system, 'text');
  const buttonDefaultStyle = resolveComponentDefaultStyle(system, 'button-primary');
  const secondaryButtonStyle = resolveComponentDefaultStyle(system, 'button-secondary');
  const formDefaultStyle = resolveComponentDefaultStyle(system, 'form');
  const formInputStyle = resolveComponentDefaultPartStyle(system, 'form', 'input');
  const previewHeadingStyle = {
    color: headingDefaultStyle.color ?? textColor,
    fontFamily: headingDefaultStyle.fontFamily ?? headingStyle?.fontFamily,
    fontSize: headingDefaultStyle.fontSize ?? headingOneStyle?.fontSize ?? '2rem',
    fontWeight: headingDefaultStyle.fontWeight ?? headingOneStyle?.fontWeight,
    letterSpacing: headingDefaultStyle.letterSpacing ?? headingOneStyle?.letterSpacing,
    lineHeight: headingDefaultStyle.lineHeight ?? headingOneStyle?.lineHeight,
  };
  const previewBodyStyle = {
    color: bodyDefaultStyle.color ?? textColor,
    fontFamily: bodyDefaultStyle.fontFamily ?? bodyStyle?.fontFamily,
    fontSize: bodyDefaultStyle.fontSize ?? bodyStyle?.fontSize,
    lineHeight: bodyDefaultStyle.lineHeight ?? bodyStyle?.lineHeight,
  };
  const previewRadius = previewScalarValue(
    system,
    'radii',
    ['radius-md', 'radius-sm'],
    '12px',
  );
  const previewShadow = previewScalarValue(
    system,
    'shadows',
    ['shadow-card'],
    '0 18px 45px rgba(15, 23, 42, .12)',
  );
  const previewSpacing = previewScalarValue(
    system,
    'spacing',
    ['space-3', 'space-2'],
    '32px',
  );
  const previewContrast = contrastRatio(textColor, surfaceColor);
  const isDirty = savedFingerprint !== JSON.stringify(system);
  const isLive =
    !isDirty &&
    publishedFingerprint === JSON.stringify(system) &&
    (!siteId || siteStatus === 'published');
  const selectedComponentDefinition = selectedComponentType
    ? designSystemComponentEntries.find(
        (entry) =>
          selectedComponentType === entry.type ||
          selectedComponentType.startsWith(`${entry.type}-`),
      )
    : undefined;
  const selectedComponentDefaults = selectedComponentType
    ? resolveDesignSystemComponentDefaults(system, selectedComponentType)
    : undefined;
  const selectedComponentParts = selectedComponentDefinition?.designSystem?.parts ?? [];
  const activeComponentPart = selectedComponentParts.includes(selectedComponentPart ?? '')
    ? selectedComponentPart
    : selectedComponentParts[0];
  const selectedComponentStyleBlock =
    (activeComponentPart
      ? selectedComponentDefaults?.partsStyle?.[activeComponentPart]?.[componentViewport]
      : selectedComponentDefaults?.style?.[componentViewport]) ?? {};
  const componentEntriesForCategory = designSystemComponentEntries.filter(
    (definition) => {
      const category = definition.designSystem?.category;
      if (activeCategory === 'buttons') return category === 'buttons';
      if (activeCategory === 'components') {
        return (
          category === 'components' || category === 'forms' || category === 'navigation'
        );
      }
      if (activeCategory === 'forms') return category === 'forms';
      return false;
    },
  );
  const siteUsesWorkspaceStyles = Boolean(
    siteId &&
    workspaceSystem &&
    JSON.stringify(system) === JSON.stringify(workspaceSystem),
  );

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {siteId ? 'Site override' : 'Workspace foundation'}
          </span>
          <h1>Brand &amp; styles</h1>
          <p className="muted">
            Shape how <strong>{siteName}</strong> looks across every page.
          </p>
          <div className="design-system-page-status">
            <span className={`design-system-status-pill${isLive ? ' is-live' : ''}`}>
              {isDirty
                ? 'Unsaved changes'
                : isLive
                  ? siteId
                    ? 'Live on website'
                    : 'Published defaults'
                  : 'Saved draft'}
            </span>
            <span className="muted small">
              {siteId ? 'Only this website changes.' : 'Websites inherit these defaults.'}
            </span>
          </div>
        </div>
      </div>
      {error ? (
        <div className="builder-alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="builder-alert alert-success" role="status">
          {notice}
        </div>
      ) : null}
      <div className="design-system-scope-note">
        <span className="design-system-scope-icon" aria-hidden="true">
          ✦
        </span>
        <div>
          <strong>Website styles only</strong>
          <p>
            {siteId
              ? `${siteName} uses these styles. The CMS workspace keeps its own interface theme.`
              : `These defaults can flow into ${inheritedSiteCount ?? 0} website${inheritedSiteCount === 1 ? '' : 's'}. The CMS workspace keeps its own interface theme.`}
          </p>
        </div>
      </div>
      <div className="design-system-workbench-shell">
        <div
          className={`design-system-workbench${editorCollapsed ? ' is-editor-collapsed' : ''}`}
        >
          <WebsitePreview
            bodyStyle={previewBodyStyle}
            buttonStyle={buttonDefaultStyle}
            secondaryButtonStyle={secondaryButtonStyle}
            formStyle={formDefaultStyle}
            formInputStyle={formInputStyle}
            colors={{
              pageBackground: pageBackgroundColor,
              primary: primaryColor,
              surface: surfaceColor,
              text: textColor,
              muted: mutedColor,
            }}
            contrast={previewContrast}
            device={previewDevice}
            headingStyle={previewHeadingStyle}
            onDeviceChange={setPreviewDevice}
            onPageChange={setPreviewPage}
            page={previewPage}
            radius={previewRadius}
            shadow={previewShadow}
            siteLogo={siteLogo}
            siteName={siteName}
            spacing={previewSpacing}
          />
          <div
            className={`design-system-editor${editorCollapsed ? ' is-collapsed' : ''}`}
          >
            <div className="design-system-editor-toolbar">
              <div className="design-system-editor-toolbar-row">
                <div>
                  <strong>Brand &amp; styles</strong>
                  <span className="design-system-editor-toolbar-hint">
                    {siteUsesWorkspaceStyles ? 'Using workspace style' : 'Draft style'}
                  </span>
                </div>
                <div className="design-system-editor-toolbar-tools">
                  <span className="design-system-editor-toolbar-hint">Live preview</span>
                  <button
                    aria-label={editorCollapsed ? 'Open editor' : 'Hide editor'}
                    className="button button-small button-ghost"
                    onClick={() => setEditorCollapsed((collapsed) => !collapsed)}
                    type="button"
                  >
                    {editorCollapsed ? 'Open' : 'Hide'}
                  </button>
                </div>
              </div>
              {siteId && workspaceSystem && !siteUsesWorkspaceStyles ? (
                <button
                  className="button button-small button-ghost"
                  disabled={!canUpdate || saving}
                  onClick={() => setSystem(workspaceSystem)}
                  type="button"
                >
                  Use workspace style
                </button>
              ) : null}
              {canUpdate ? (
                <div className="form-actions design-system-editor-actions">
                  <button
                    className="button button-primary"
                    disabled={saving}
                    onClick={() => void save()}
                    type="button"
                  >
                    {saving ? 'Saving…' : 'Save draft'}
                  </button>
                  {!siteId ? (
                    <button
                      className="button button-secondary"
                      disabled={saving}
                      onClick={() => void publishWorkspace()}
                      type="button"
                    >
                      Publish styles
                    </button>
                  ) : null}
                  {siteId ? (
                    <button
                      className="button button-secondary"
                      disabled={saving}
                      onClick={() => void publishSite()}
                      type="button"
                    >
                      Publish styles
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="design-system-editor-content">
              <aside
                className="design-system-category-rail"
                aria-label="Design system categories"
              >
                <span className="eyebrow">Make it yours</span>
                <h2>Brand basics</h2>
                <button
                  className={activeCategory === 'overview' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('overview')}
                  type="button"
                >
                  Overview
                </button>
                <button
                  className={activeCategory === 'colors' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('colors')}
                  type="button"
                >
                  Colors
                </button>
                <button
                  className={activeCategory === 'typography' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('typography')}
                  type="button"
                >
                  Typography
                </button>
                <button
                  className={activeCategory === 'buttons' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('buttons')}
                  type="button"
                >
                  Buttons
                </button>
                <button
                  className={activeCategory === 'forms' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('forms')}
                  type="button"
                >
                  Forms
                </button>
                <button
                  className={activeCategory === 'components' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('components')}
                  type="button"
                >
                  Components
                </button>
                <details className="design-system-advanced-menu">
                  <summary>Advanced design system</summary>
                  <span className="muted small">
                    Spacing, radius, shadows, and layout defaults.
                  </span>
                  {scalarCategories
                    .filter(([category]) => category !== 'colors')
                    .map(([category, label]) => (
                      <button
                        className={activeCategory === category ? 'is-active' : ''}
                        key={category}
                        onClick={() => setActiveCategory(category)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                </details>
              </aside>
              <div className="grid grid-2 design-system-token-grid">
                {activeCategory === 'overview' ? (
                  <section className="panel stack design-system-overview-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Quick brand setup</h2>
                        <span className="muted small">
                          A small snapshot of the styles used across your site.
                        </span>
                      </div>
                    </div>
                    {[
                      ['Primary', primaryColor, 'colors'],
                      ['Page background', pageBackgroundColor, 'colors'],
                      [
                        'Heading font',
                        headingStyle?.fontFamily ?? 'System font',
                        'typography',
                      ],
                      ['Body font', bodyStyle?.fontFamily ?? 'System font', 'typography'],
                    ].map(([label, value, category]) => (
                      <button
                        className="design-system-setting-row"
                        key={label}
                        onClick={() =>
                          setActiveCategory(category as 'colors' | 'typography')
                        }
                        type="button"
                      >
                        <span>
                          <strong>{label}</strong>
                          <small>{value}</small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                    <div className="design-system-overview-button-preview">
                      <span className="muted small">Primary button</span>
                      <button style={buttonDefaultStyle} type="button">
                        Get started
                      </button>
                    </div>
                  </section>
                ) : null}
                {scalarCategories
                  .filter(([category]) => activeCategory === category)
                  .map(([category, label]) => (
                    <section className="panel stack" key={category}>
                      <div className="panel-heading">
                        <div>
                          <h2>{category === 'colors' ? 'Colors' : label}</h2>
                          <span className="muted small">
                            {category === 'colors'
                              ? 'Changes show above instantly.'
                              : `${system[category].length} values`}
                          </span>
                        </div>
                        {canUpdate ? (
                          <button
                            className="button button-small button-ghost"
                            onClick={() => setSystem(addScalar(system, category))}
                            type="button"
                          >
                            {category === 'colors' ? 'Add color' : 'Add value'}
                          </button>
                        ) : null}
                      </div>
                      {system[category].map((token: DesignScalarToken) => {
                        const selected =
                          category === 'colors' && selectedColorId === token.id;
                        const usedBy = Object.entries(system.semanticRoles ?? {})
                          .filter(([, tokenId]) => tokenId === token.id)
                          .map(([role]) =>
                            role
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, (value) => value.toUpperCase()),
                          );
                        return category === 'colors' ? (
                          <article className="design-system-setting" key={token.id}>
                            <button
                              aria-expanded={selected}
                              className="design-system-setting-row"
                              onClick={() =>
                                setSelectedColorId(selected ? null : token.id)
                              }
                              type="button"
                            >
                              <span>
                                <strong>{token.name}</strong>
                                <small>
                                  {usedBy.length ? usedBy.join(' · ') : 'Custom color'}
                                </small>
                              </span>
                              <span className="design-system-color-summary">
                                <i style={{ backgroundColor: token.value }} />
                                {token.value}
                                <span aria-hidden="true">{selected ? '⌃' : '›'}</span>
                              </span>
                            </button>
                            {selected ? (
                              <div className="design-system-detail-panel">
                                <ColorField
                                  compact
                                  disabled={!canUpdate}
                                  label={`${token.name} color`}
                                  onValueChange={(value) =>
                                    setSystem(
                                      updateScalar(
                                        system,
                                        category,
                                        token.id,
                                        'value',
                                        value,
                                      ),
                                    )
                                  }
                                  value={token.value}
                                />
                                <label>
                                  <span>Color name</span>
                                  <input
                                    disabled={!canUpdate}
                                    onChange={(event) =>
                                      setSystem(
                                        updateScalar(
                                          system,
                                          category,
                                          token.id,
                                          'name',
                                          event.target.value,
                                        ),
                                      )
                                    }
                                    value={token.name}
                                  />
                                </label>
                                <p className="muted small">
                                  Used by{' '}
                                  {usedBy.length ? usedBy.join(', ') : 'custom styles'}.
                                </p>
                                {canUpdate ? (
                                  <div className="button-row">
                                    <button
                                      className="button button-small button-ghost"
                                      onClick={() =>
                                        setSystem({
                                          ...system,
                                          colors: [
                                            ...system.colors,
                                            {
                                              ...token,
                                              id: nextTokenId('color', system),
                                              name: `${token.name} copy`,
                                            },
                                          ],
                                        })
                                      }
                                      type="button"
                                    >
                                      Duplicate
                                    </button>
                                    <button
                                      className="button button-small button-ghost"
                                      onClick={() =>
                                        setSystem({
                                          ...system,
                                          colors: system.colors.filter(
                                            (candidate) => candidate.id !== token.id,
                                          ),
                                        })
                                      }
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        ) : (
                          <div className="design-system-advanced-row" key={token.id}>
                            <label>
                              <span>{token.name}</span>
                              <input
                                disabled={!canUpdate}
                                onChange={(event) =>
                                  setSystem(
                                    updateScalar(
                                      system,
                                      category,
                                      token.id,
                                      'value',
                                      event.target.value,
                                    ),
                                  )
                                }
                                value={token.value}
                              />
                            </label>
                            <details className="design-system-advanced-field">
                              <summary>Advanced</summary>
                              <small className="muted">Stable id: {token.id}</small>
                            </details>
                          </div>
                        );
                      })}
                    </section>
                  ))}
                {activeCategory === 'typography' ? (
                  <section className="panel stack">
                    <div className="panel-heading">
                      <div>
                        <h2>Typography</h2>
                        <span className="muted small">Your heading and body styles.</span>
                      </div>
                      {canUpdate ? (
                        <button
                          className="button button-small button-ghost"
                          onClick={() => setSystem(addTypography(system))}
                          type="button"
                        >
                          Add token
                        </button>
                      ) : null}
                    </div>
                    {system.typography
                      .filter((token) => token.id !== 'type-heading')
                      .map((token) => {
                        const selected = selectedTypographyId === token.id;
                        return (
                          <article className="design-system-setting" key={token.id}>
                            <button
                              aria-expanded={selected}
                              className="design-system-setting-row"
                              onClick={() =>
                                setSelectedTypographyId(selected ? null : token.id)
                              }
                              type="button"
                            >
                              <span>
                                <strong>{token.name}</strong>
                                <small>
                                  {token.fontFamily ?? 'System font'} ·{' '}
                                  {token.fontSize ?? 'Auto'} /{' '}
                                  {token.lineHeight ?? 'normal'} ·{' '}
                                  {token.fontWeight ?? '400'}
                                </small>
                              </span>
                              <span aria-hidden="true">{selected ? '⌃' : '›'}</span>
                            </button>
                            {selected ? (
                              <div className="design-system-detail-panel">
                                {(
                                  [
                                    'fontFamily',
                                    'fontSize',
                                    'fontWeight',
                                    'lineHeight',
                                    'letterSpacing',
                                  ] as const
                                ).map((field) => (
                                  <label key={field}>
                                    <span>{typographyFieldLabel(field)}</span>
                                    <input
                                      disabled={!canUpdate}
                                      onChange={(event) =>
                                        setSystem(
                                          updateTypography(
                                            system,
                                            token.id,
                                            field,
                                            event.target.value,
                                          ),
                                        )
                                      }
                                      value={token[field] ?? ''}
                                    />
                                  </label>
                                ))}
                                <details className="design-system-advanced-field">
                                  <summary>Advanced</summary>
                                  <small className="muted">Stable id: {token.id}</small>
                                </details>
                                {canUpdate ? (
                                  <div className="button-row">
                                    <button
                                      className="button button-small button-ghost"
                                      onClick={() =>
                                        setSystem({
                                          ...system,
                                          typography: [
                                            ...system.typography,
                                            {
                                              ...token,
                                              id: nextTokenId('type', system),
                                              name: `${token.name} copy`,
                                            },
                                          ],
                                        })
                                      }
                                      type="button"
                                    >
                                      Duplicate
                                    </button>
                                    <button
                                      className="button button-small button-ghost"
                                      onClick={() =>
                                        setSystem({
                                          ...system,
                                          typography: system.typography.filter(
                                            (candidate) => candidate.id !== token.id,
                                          ),
                                        })
                                      }
                                      type="button"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                  </section>
                ) : null}
                {activeCategory === 'components' ||
                activeCategory === 'buttons' ||
                activeCategory === 'forms' ? (
                  <section className="panel stack design-system-components-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          {activeCategory === 'buttons'
                            ? 'Buttons'
                            : activeCategory === 'forms'
                              ? 'Forms'
                              : 'Components'}
                        </h2>
                        <span className="muted small">
                          New sections start with these styles automatically.
                        </span>
                      </div>
                    </div>
                    <div className="design-system-component-grid">
                      {componentEntriesForCategory.flatMap((definition) => {
                        const componentType = definition.type;
                        const label = definition.designSystem?.label ?? definition.label;
                        const variants = definition.designSystem?.variants ?? [
                          { id: 'base', label },
                        ];
                        return variants.map((variant) => {
                          const recipeKey = componentRecipeKey(componentType, variant.id);
                          const defaults = resolveDesignSystemComponentDefaults(
                            system,
                            recipeKey,
                          );
                          const previewStyle = resolveComponentDefaultStyle(
                            system,
                            recipeKey,
                          );
                          const selected = selectedComponentType === recipeKey;
                          return (
                            <article
                              className="design-system-component-card"
                              key={recipeKey}
                            >
                              <button
                                aria-expanded={selected}
                                className="design-system-setting-row"
                                onClick={() => {
                                  setSelectedComponentType(selected ? null : recipeKey);
                                  setSelectedComponentPart(null);
                                }}
                                type="button"
                              >
                                <span>
                                  <strong>{variant.label}</strong>
                                  <small>{label}</small>
                                </span>
                                <span className="design-system-setting-preview">
                                  {componentType === 'button' ? (
                                    <span style={previewStyle}>Preview</span>
                                  ) : componentType === 'heading' ? (
                                    <span style={previewStyle}>Aa</span>
                                  ) : (
                                    <span style={previewStyle}>Aa</span>
                                  )}
                                  <span aria-hidden="true">{selected ? '⌃' : '›'}</span>
                                </span>
                              </button>
                              {selected ? (
                                <div className="design-system-detail-panel">
                                  <span className="design-system-inheritance-label">
                                    {siteId && !siteUsesWorkspaceStyles
                                      ? 'Customized for this website'
                                      : 'Using Brand & styles'}
                                  </span>
                                  {selectedComponentParts.length > 0 ? (
                                    <label>
                                      <span>Part</span>
                                      <select
                                        onChange={(event) =>
                                          setSelectedComponentPart(event.target.value)
                                        }
                                        value={activeComponentPart ?? ''}
                                      >
                                        {selectedComponentParts.map((part) => (
                                          <option key={part} value={part}>
                                            {part.replace(/([A-Z])/g, ' $1')}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  ) : null}
                                  <div
                                    aria-label="Responsive style size"
                                    className="design-system-responsive-toggle"
                                    role="group"
                                  >
                                    {(
                                      [
                                        ['base', 'Desktop'],
                                        ['tablet', 'Tablet'],
                                        ['mobile', 'Mobile'],
                                      ] as const
                                    ).map(([value, label]) => (
                                      <button
                                        aria-pressed={componentViewport === value}
                                        className={
                                          componentViewport === value ? 'is-active' : ''
                                        }
                                        key={value}
                                        onClick={() => setComponentViewport(value)}
                                        type="button"
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  {(componentDefaultFields[componentType] ?? []).map(
                                    ({ property, label: fieldLabel }) => {
                                      const options = tokenOptions(system, property);
                                      const currentValue = tokenValue(
                                        selectedComponentStyleBlock[property],
                                      );
                                      return (
                                        <label key={property}>
                                          <span>{fieldLabel}</span>
                                          <select
                                            disabled={!canUpdate}
                                            onChange={(event) =>
                                              setSystem(
                                                activeComponentPart
                                                  ? updateComponentPartDefault(
                                                      system,
                                                      recipeKey,
                                                      activeComponentPart,
                                                      property,
                                                      event.target.value
                                                        ? selectedStyleValue(
                                                            event.target.value,
                                                          )
                                                        : undefined,
                                                      componentViewport,
                                                    )
                                                  : updateComponentDefault(
                                                      system,
                                                      recipeKey,
                                                      property,
                                                      event.target.value
                                                        ? selectedStyleValue(
                                                            event.target.value,
                                                          )
                                                        : undefined,
                                                      componentViewport,
                                                    ),
                                              )
                                            }
                                            value={currentValue}
                                          >
                                            {!currentValue ? (
                                              <option value="">Unset</option>
                                            ) : null}
                                            {typeof selectedComponentStyleBlock[
                                              property
                                            ] === 'string' &&
                                            !currentValue.startsWith('token:') ? (
                                              <option value={currentValue}>
                                                Current value
                                              </option>
                                            ) : null}
                                            {options.map((option) => (
                                              <option
                                                key={option.id}
                                                value={`token:${option.id}`}
                                              >
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      );
                                    },
                                  )}
                                  {canUpdate ? (
                                    <button
                                      className="button button-small button-ghost"
                                      disabled={!defaults}
                                      onClick={() =>
                                        setSystem(
                                          resetComponentDefault(system, recipeKey),
                                        )
                                      }
                                      type="button"
                                    >
                                      Reset style
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </article>
                          );
                        });
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
