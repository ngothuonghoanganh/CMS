'use client';

import {
  SiteDesignSystemResponseSchema,
  createDefaultSiteDesignSystem,
  normalizeSiteDesignSystemOverride,
  resolveDesignSystemComponentDefaults,
  resolvePageStyleValue,
  isSafePageStyleValue,
  type DesignScalarToken,
  type PageNodeStyleV7,
  type SiteDesignSystem,
  type StyleTokenReference,
  type TypographyToken,
} from '@payload/contracts';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { ApiClientError, api } from '../lib/api';
import { ColorField } from '../ui/fields';

type DesignSystemViewProps = {
  workspaceId: string;
  siteId?: string;
  canUpdate: boolean;
  canPublish: boolean;
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

type ComponentStyleProperty =
  | 'backgroundColor'
  | 'borderRadius'
  | 'color'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'gap'
  | 'lineHeight'
  | 'padding';

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

const componentDefaultTypes = [
  ['heading', 'Heading'],
  ['text', 'Body text'],
  ['button', 'Button'],
  ['form', 'Form'],
  ['navigation-view', 'Navigation'],
] as const;

const componentDefaultFields: Record<
  (typeof componentDefaultTypes)[number][0],
  readonly { property: ComponentStyleProperty; label: string }[]
> = {
  heading: [
    { property: 'color', label: 'Text color' },
    { property: 'fontFamily', label: 'Font family' },
    { property: 'fontSize', label: 'Font size' },
    { property: 'fontWeight', label: 'Font weight' },
  ],
  text: [
    { property: 'color', label: 'Text color' },
    { property: 'fontFamily', label: 'Font family' },
    { property: 'fontSize', label: 'Font size' },
    { property: 'lineHeight', label: 'Line height' },
  ],
  button: [
    { property: 'backgroundColor', label: 'Background' },
    { property: 'color', label: 'Text color' },
    { property: 'padding', label: 'Padding' },
    { property: 'borderRadius', label: 'Radius' },
  ],
  form: [
    { property: 'backgroundColor', label: 'Background' },
    { property: 'padding', label: 'Padding' },
  ],
  'navigation-view': [
    { property: 'color', label: 'Text color' },
    { property: 'gap', label: 'Item gap' },
    { property: 'padding', label: 'Padding' },
  ],
};

const componentTokenCategories: Record<
  ComponentStyleProperty,
  (typeof scalarCategories)[number][0] | 'typography'
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

export function updateComponentDefault(
  system: SiteDesignSystem,
  componentType: string,
  property: ComponentStyleProperty,
  value: string | StyleTokenReference | undefined,
): SiteDesignSystem {
  const current = system.componentDefaults?.[componentType];
  const base = { ...(current?.style?.base ?? {}) };
  if (value === undefined) delete base[property];
  else
    (base as Record<ComponentStyleProperty, string | StyleTokenReference | undefined>)[
      property
    ] = value;
  return {
    ...system,
    componentDefaults: {
      ...(system.componentDefaults ?? {}),
      [componentType]: {
        ...(current ?? {}),
        style: {
          ...(current?.style ?? {}),
          base: base as PageNodeStyleV7['base'],
        },
      },
    },
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

type PreviewDevice = 'desktop' | 'mobile';
type PreviewPage = 'home' | 'services' | 'contact';
type EditorOffset = { x: number; y: number };
type EditorDrag = {
  animationFrame: number | null;
  latestOffset: EditorOffset;
  pointerId: number;
  startOffset: EditorOffset;
  startRect: DOMRect;
  startX: number;
  startY: number;
};

type WebsitePreviewProps = {
  device: PreviewDevice;
  headingStyle: CSSProperties;
  bodyStyle: CSSProperties;
  buttonStyle: CSSProperties;
  colors: {
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
  patterns: readonly string[],
  fallback: string,
): string {
  const token = system.colors.find((candidate) => {
    const searchable = `${candidate.id} ${candidate.name}`.toLowerCase();
    return patterns.some((pattern) => searchable.includes(pattern));
  });
  return token?.value && isSafePageStyleValue(token.value) ? token.value : fallback;
}

function previewScalarValue(
  system: SiteDesignSystem,
  category: 'spacing' | 'radii' | 'shadows',
  patterns: readonly string[],
  fallback: string,
): string {
  const token = system[category].find((candidate) => {
    const searchable = `${candidate.id} ${candidate.name}`.toLowerCase();
    return patterns.some((pattern) => searchable.includes(pattern));
  });
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
          Surface color → page and cards
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
          <div className="site-preview-page">
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
                    <button className="site-preview-secondary-button" type="button">
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
                <div className="site-preview-contact-card">
                  <span className="site-preview-eyebrow">Contact form</span>
                  <h3>Start a conversation.</h3>
                  <label>
                    Name
                    <input placeholder="Your name" readOnly />
                  </label>
                  <label>
                    Email
                    <input placeholder="you@example.com" readOnly />
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
  canPublish,
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
  const [editorOffset, setEditorOffset] = useState<EditorOffset>({ x: 0, y: 0 });
  const [isEditorDragging, setIsEditorDragging] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorDragRef = useRef<EditorDrag | null>(null);
  const [activeCategory, setActiveCategory] = useState<
    'overview' | 'components' | 'typography' | (typeof scalarCategories)[number][0]
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

  function startEditorDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !editorRef.current) return;
    editorDragRef.current = {
      animationFrame: null,
      latestOffset: editorOffset,
      pointerId: event.pointerId,
      startOffset: editorOffset,
      startRect: editorRef.current.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setIsEditorDragging(true);
  }

  function moveEditorDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = editorDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const desiredLeft = drag.startRect.left + event.clientX - drag.startX;
    const desiredTop = drag.startRect.top + event.clientY - drag.startY;
    const minLeft = 16;
    const maxLeft = Math.max(minLeft, window.innerWidth - drag.startRect.width - 16);
    const minTop = 72;
    const maxTop = Math.max(minTop, window.innerHeight - drag.startRect.height - 16);
    const nextLeft = Math.min(Math.max(minLeft, desiredLeft), maxLeft);
    const nextTop = Math.min(Math.max(minTop, desiredTop), maxTop);
    const nextOffset = {
      x: drag.startOffset.x + nextLeft - drag.startRect.left,
      y: drag.startOffset.y + nextTop - drag.startRect.top,
    };
    drag.latestOffset = nextOffset;
    if (drag.animationFrame !== null) return;
    drag.animationFrame = window.requestAnimationFrame(() => {
      drag.animationFrame = null;
      if (!editorRef.current || editorDragRef.current !== drag) return;
      editorRef.current.style.transform = `translate3d(${drag.latestOffset.x}px, ${drag.latestOffset.y}px, 0)`;
    });
  }

  function stopEditorDrag(event?: ReactPointerEvent<HTMLButtonElement>) {
    const drag = editorDragRef.current;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag?.animationFrame !== null && drag?.animationFrame !== undefined) {
      window.cancelAnimationFrame(drag.animationFrame);
      drag.animationFrame = null;
    }
    if (drag) {
      setEditorOffset(drag.latestOffset);
      if (editorRef.current) {
        editorRef.current.style.transform = `translate3d(${drag.latestOffset.x}px, ${drag.latestOffset.y}px, 0)`;
      }
    }
    editorDragRef.current = null;
    setIsEditorDragging(false);
  }

  function nudgeEditor(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = 16;
    const moves: Record<string, EditorOffset> = {
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setEditorOffset((current) => ({ x: current.x + move.x, y: current.y + move.y }));
  }

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
    if (!siteId || !canPublish || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/workspaces/${workspaceId}/sites/${siteId}/publish`, {});
      const refreshed = SiteDesignSystemResponseSchema.parse(
        await api.get(`/workspaces/${workspaceId}/sites/${siteId}/design-system`),
      );
      setSystem(refreshed.draft);
      setSavedFingerprint(JSON.stringify(refreshed.draft));
      setPublishedFingerprint(
        refreshed.published ? JSON.stringify(refreshed.published) : null,
      );
      setNotice('Website published with these styles.');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Website could not be published.',
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

  const primaryColor = previewTokenValue(system, ['primary', 'brand'], '#2563eb');
  const surfaceColor = previewTokenValue(system, ['surface', 'background'], '#ffffff');
  const textColor = previewTokenValue(system, ['text', 'foreground'], '#111827');
  const mutedColor = previewTokenValue(system, ['muted', 'secondary'], '#6b7280');
  const headingStyle = system.typography.find((token) => token.id.includes('heading'));
  const bodyStyle = system.typography.find((token) => token.id.includes('body'));
  const headingDefaultStyle = resolveComponentDefaultStyle(system, 'heading');
  const bodyDefaultStyle = resolveComponentDefaultStyle(system, 'text');
  const buttonDefaultStyle = resolveComponentDefaultStyle(system, 'button');
  const previewHeadingStyle = {
    color: headingDefaultStyle.color ?? textColor,
    fontFamily: headingDefaultStyle.fontFamily ?? headingStyle?.fontFamily,
    fontSize: headingDefaultStyle.fontSize ?? headingStyle?.fontSize ?? '2rem',
    fontWeight: headingDefaultStyle.fontWeight ?? headingStyle?.fontWeight,
    letterSpacing: headingDefaultStyle.letterSpacing ?? headingStyle?.letterSpacing,
    lineHeight: headingDefaultStyle.lineHeight ?? headingStyle?.lineHeight,
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
    ['medium', 'md', 'card'],
    '12px',
  );
  const previewShadow = previewScalarValue(
    system,
    'shadows',
    ['card', 'medium'],
    '0 18px 45px rgba(15, 23, 42, .12)',
  );
  const previewSpacing = previewScalarValue(
    system,
    'spacing',
    ['large', 'section', 'space-3'],
    '32px',
  );
  const previewContrast = contrastRatio(textColor, surfaceColor);
  const isDirty = savedFingerprint !== JSON.stringify(system);
  const isLive =
    !isDirty &&
    publishedFingerprint === JSON.stringify(system) &&
    (!siteId || siteStatus === 'published');

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
        <div className="design-system-workbench">
          <WebsitePreview
            bodyStyle={previewBodyStyle}
            buttonStyle={buttonDefaultStyle}
            colors={{
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
          {isEditorOpen ? (
            <div
              className={`design-system-editor${isEditorDragging ? ' is-dragging' : ''}`}
              ref={editorRef}
              style={{
                transform: `translate3d(${editorOffset.x}px, ${editorOffset.y}px, 0)`,
              }}
            >
              <div className="design-system-editor-toolbar">
                <div className="design-system-editor-toolbar-row">
                  <button
                    aria-label="Move design editor"
                    className="design-system-editor-drag-handle"
                    onKeyDown={nudgeEditor}
                    onPointerCancel={stopEditorDrag}
                    onPointerDown={startEditorDrag}
                    onPointerMove={moveEditorDrag}
                    onPointerUp={stopEditorDrag}
                    title="Drag to move the editor panel"
                    type="button"
                  >
                    <span aria-hidden="true">⠿</span>
                    <span>Move editor</span>
                  </button>
                  <span className="design-system-editor-toolbar-hint">
                    Drag to keep controls beside your preview
                  </span>
                  <button
                    className="button button-small button-ghost"
                    onClick={() => setEditorOffset({ x: 0, y: 0 })}
                    type="button"
                  >
                    Reset position
                  </button>
                  <button
                    aria-label="Close design editor"
                    className="button button-small button-ghost"
                    onClick={() => {
                      stopEditorDrag();
                      setIsEditorOpen(false);
                    }}
                    type="button"
                  >
                    Close editor
                  </button>
                </div>
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
                        Publish defaults
                      </button>
                    ) : null}
                    {siteId && canPublish ? (
                      <button
                        className="button button-secondary"
                        disabled={saving}
                        onClick={() => void publishSite()}
                        type="button"
                      >
                        Publish website
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <aside
                className="panel design-system-category-rail"
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
                  className={activeCategory === 'components' ? 'is-active' : ''}
                  onClick={() => setActiveCategory('components')}
                  type="button"
                >
                  Buttons &amp; components
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
                {scalarCategories
                  .filter(
                    ([category]) =>
                      activeCategory === category ||
                      (activeCategory === 'overview' && category === 'colors'),
                  )
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
                      {system[category].map((token: DesignScalarToken) => (
                        <div className="form-row" key={token.id}>
                          <div className="stack">
                            <label>
                              <span>{category === 'colors' ? 'Color name' : 'Name'}</span>
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
                            <details className="design-system-advanced-field">
                              <summary>Advanced</summary>
                              <small className="muted">Stable id: {token.id}</small>
                            </details>
                            {category === 'colors' ? (
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
                            ) : (
                              <label>
                                <span>Value</span>
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
                            )}
                            {canUpdate ? (
                              <div className="button-row">
                                <button
                                  className="button button-small button-ghost"
                                  onClick={() =>
                                    setSystem({
                                      ...system,
                                      [category]: [
                                        ...system[category],
                                        {
                                          ...token,
                                          id: nextTokenId(category.slice(0, -1), system),
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
                                      [category]: system[category].filter(
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
                        </div>
                      ))}
                    </section>
                  ))}
                {activeCategory === 'overview' || activeCategory === 'typography' ? (
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
                    {system.typography.map((token) => (
                      <div className="stack" key={token.id}>
                        <label>
                          <span>Name</span>
                          <input
                            disabled={!canUpdate}
                            onChange={(event) =>
                              setSystem(
                                updateTypography(
                                  system,
                                  token.id,
                                  'name',
                                  event.target.value,
                                ),
                              )
                            }
                            value={token.name}
                          />
                        </label>
                        <details className="design-system-advanced-field">
                          <summary>Advanced</summary>
                          <small className="muted">Stable id: {token.id}</small>
                        </details>
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
                            {typographyFieldLabel(field)}
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
                    ))}
                  </section>
                ) : null}
                {activeCategory === 'overview' || activeCategory === 'components' ? (
                  <section className="panel stack design-system-components-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Buttons &amp; components</h2>
                        <span className="muted small">
                          New sections start with these styles automatically.
                        </span>
                      </div>
                    </div>
                    <div className="design-system-component-grid">
                      {componentDefaultTypes.map(([componentType, label]) => {
                        const defaults = resolveDesignSystemComponentDefaults(
                          system,
                          componentType,
                        );
                        const base = defaults?.style?.base ?? {};
                        const previewStyle = resolveComponentDefaultStyle(
                          system,
                          componentType,
                        );
                        return (
                          <article
                            className="design-system-component-card"
                            key={componentType}
                          >
                            <div className="panel-heading">
                              <div>
                                <h3>{label}</h3>
                                <span className="muted small">
                                  Used throughout your website
                                </span>
                              </div>
                            </div>
                            <div className="design-system-component-preview">
                              {componentType === 'heading' ? (
                                <h4 style={previewStyle}>Heading preview</h4>
                              ) : componentType === 'text' ? (
                                <p style={previewStyle}>Body copy preview</p>
                              ) : componentType === 'button' ? (
                                <button style={previewStyle} type="button">
                                  Button preview
                                </button>
                              ) : componentType === 'form' ? (
                                <div style={previewStyle}>Form surface preview</div>
                              ) : (
                                <nav style={previewStyle}>
                                  <span>Home</span>
                                  <span>Work</span>
                                  <span>Contact</span>
                                </nav>
                              )}
                            </div>
                            <div className="design-system-component-controls">
                              {componentDefaultFields[componentType].map(
                                ({ property, label: fieldLabel }) => {
                                  const options = tokenOptions(system, property);
                                  const currentValue = tokenValue(base[property]);
                                  return (
                                    <label key={property}>
                                      <span>{fieldLabel}</span>
                                      <select
                                        disabled={!canUpdate}
                                        onChange={(event) =>
                                          setSystem(
                                            updateComponentDefault(
                                              system,
                                              componentType,
                                              property,
                                              event.target.value
                                                ? selectedStyleValue(event.target.value)
                                                : undefined,
                                            ),
                                          )
                                        }
                                        value={currentValue}
                                      >
                                        {!currentValue ? (
                                          <option value="">Unset</option>
                                        ) : null}
                                        {typeof base[property] === 'string' &&
                                        !currentValue.startsWith('token:') ? (
                                          <option value={currentValue}>
                                            Current literal
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
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <button
              className="button button-primary design-system-editor-reopen"
              onClick={() => setIsEditorOpen(true)}
              type="button"
            >
              <span aria-hidden="true">✦</span>
              Open editor
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
