'use client';

import {
  SiteDesignSystemResponseSchema,
  resolveDesignSystemComponentDefaults,
  resolvePageStyleValue,
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
}: DesignSystemViewProps) {
  const [system, setSystem] = useState<SiteDesignSystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<
    'overview' | 'components' | 'typography' | (typeof scalarCategories)[number][0]
  >('overview');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .get(
        siteId
          ? `/workspaces/${workspaceId}/sites/${siteId}/design-system`
          : `/workspaces/${workspaceId}/design-system`,
      )
      .then((response) => {
        if (cancelled) return;
        setSystem(SiteDesignSystemResponseSchema.parse(response).draft);
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
      setSystem(
        SiteDesignSystemResponseSchema.parse(
          await api.patch(
            siteId
              ? `/workspaces/${workspaceId}/sites/${siteId}/design-system`
              : `/workspaces/${workspaceId}/design-system`,
            system,
          ),
        ).draft,
      );
      setNotice(
        siteId
          ? 'Site design system draft saved.'
          : 'Workspace design system draft saved. Publish it to make defaults public.',
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

  const primaryColor =
    system.colors.find((token) => token.id.includes('primary'))?.value ??
    system.colors[0]?.value ??
    '#2563eb';
  const accentColor =
    system.colors.find((token) => token.id.includes('accent'))?.value ??
    system.colors[1]?.value ??
    '#0f172a';
  const headingStyle = system.typography.find((token) => token.id.includes('heading'));
  const bodyStyle = system.typography.find((token) => token.id.includes('body'));
  const headingDefaultStyle = resolveComponentDefaultStyle(system, 'heading');
  const bodyDefaultStyle = resolveComponentDefaultStyle(system, 'text');
  const buttonDefaultStyle = resolveComponentDefaultStyle(system, 'button');
  const navigationDefaultStyle = resolveComponentDefaultStyle(system, 'navigation-view');
  const previewHeadingStyle = {
    color: accentColor,
    fontFamily: headingDefaultStyle.fontFamily ?? headingStyle?.fontFamily,
    fontSize: headingDefaultStyle.fontSize ?? headingStyle?.fontSize ?? '2rem',
    fontWeight: headingDefaultStyle.fontWeight ?? headingStyle?.fontWeight,
    letterSpacing: headingDefaultStyle.letterSpacing ?? headingStyle?.letterSpacing,
    lineHeight: headingDefaultStyle.lineHeight ?? headingStyle?.lineHeight,
  };
  const previewBodyStyle = {
    color: accentColor,
    fontFamily: bodyDefaultStyle.fontFamily ?? bodyStyle?.fontFamily,
    fontSize: bodyDefaultStyle.fontSize ?? bodyStyle?.fontSize,
    lineHeight: bodyDefaultStyle.lineHeight ?? bodyStyle?.lineHeight,
  };

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {siteId ? 'Site override' : 'Workspace foundation'}
          </span>
          <h1>Design system</h1>
          <p className="muted">
            Edit the visual language once, preview it live, and keep styles portable when
            token names change.
          </p>
        </div>
        {canUpdate ? (
          <div className="form-actions">
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
                onClick={() => {
                  setSaving(true);
                  void api
                    .post(`/workspaces/${workspaceId}/design-system/publish`)
                    .then(() => setNotice('Workspace Design System published.'))
                    .catch((caughtError: unknown) =>
                      setError(
                        caughtError instanceof Error
                          ? caughtError.message
                          : 'Design system could not publish.',
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
                type="button"
              >
                Publish
              </button>
            ) : null}
          </div>
        ) : null}
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
      <div className="design-system-preview panel">
        <div className="panel-heading">
          <div>
            <h2>Live preview</h2>
            <span className="muted small">
              {siteId
                ? 'This site can override workspace defaults.'
                : inheritedSiteCount !== undefined
                  ? `Inherited by ${inheritedSiteCount} site${inheritedSiteCount === 1 ? '' : 's'}`
                  : 'Workspace defaults are inherited by sites without an override.'}
            </span>
          </div>
          <span className="design-system-preview-status">Draft</span>
        </div>
        <div className="design-system-preview-canvas">
          <div className="design-system-preview-nav">
            <strong style={{ color: accentColor }}>Payload</strong>
            <div style={navigationDefaultStyle}>
              <span>Work</span>
              <span>About</span>
              <button style={buttonDefaultStyle} type="button">
                Get started
              </button>
            </div>
          </div>
          <div className="design-system-preview-content">
            <span className="eyebrow" style={{ color: primaryColor }}>
              Component preview
            </span>
            <h3 style={previewHeadingStyle}>A clearer visual system.</h3>
            <p style={previewBodyStyle}>
              See how your colors, type, spacing, and component defaults work together
              before publishing them.
            </p>
            <div className="button-row">
              <button
                className="button button-primary"
                style={buttonDefaultStyle}
                type="button"
              >
                Primary action
              </button>
              <button className="button button-secondary" type="button">
                Secondary action
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="design-system-editor">
        <aside
          className="panel design-system-category-rail"
          aria-label="Design system categories"
        >
          <span className="eyebrow">Editor</span>
          <h2>Foundations</h2>
          <button
            className={activeCategory === 'overview' ? 'is-active' : ''}
            onClick={() => setActiveCategory('overview')}
            type="button"
          >
            Overview
          </button>
          {scalarCategories.map(([category, label]) => (
            <button
              className={activeCategory === category ? 'is-active' : ''}
              key={category}
              onClick={() => setActiveCategory(category)}
              type="button"
            >
              {label}
            </button>
          ))}
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
            Components
          </button>
        </aside>
        <div className="grid grid-2 design-system-token-grid">
          {scalarCategories
            .filter(
              ([category]) =>
                activeCategory === 'overview' || activeCategory === category,
            )
            .map(([category, label]) => (
              <section className="panel stack" key={category}>
                <div className="panel-heading">
                  <div>
                    <h2>{label}</h2>
                    <span className="muted small">{system[category].length} tokens</span>
                  </div>
                  {canUpdate ? (
                    <button
                      className="button button-small button-ghost"
                      onClick={() => setSystem(addScalar(system, category))}
                      type="button"
                    >
                      Add token
                    </button>
                  ) : null}
                </div>
                {system[category].map((token: DesignScalarToken) => (
                  <div className="form-row" key={token.id}>
                    <div className="stack">
                      <label>
                        <span>Name</span>
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
                      <small className="muted">Stable id: {token.id}</small>
                      {category === 'colors' ? (
                        <ColorField
                          compact
                          disabled={!canUpdate}
                          label="Color"
                          onValueChange={(value) =>
                            setSystem(
                              updateScalar(system, category, token.id, 'value', value),
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
                  <span className="muted small">{system.typography.length} tokens</span>
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
                          updateTypography(system, token.id, 'name', event.target.value),
                        )
                      }
                      value={token.name}
                    />
                  </label>
                  <small className="muted">Stable id: {token.id}</small>
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
                      {field}
                      <input
                        disabled={!canUpdate}
                        onChange={(event) =>
                          setSystem(
                            updateTypography(system, token.id, field, event.target.value),
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
                  <h2>Component defaults</h2>
                  <span className="muted small">
                    Shared visual defaults applied before local builder styles.
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
                    <article className="design-system-component-card" key={componentType}>
                      <div className="panel-heading">
                        <div>
                          <h3>{label}</h3>
                          <span className="muted small">{componentType}</span>
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
                                  {!currentValue ? <option value="">Unset</option> : null}
                                  {typeof base[property] === 'string' &&
                                  !currentValue.startsWith('token:') ? (
                                    <option value={currentValue}>Current literal</option>
                                  ) : null}
                                  {options.map((option) => (
                                    <option key={option.id} value={`token:${option.id}`}>
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
    </section>
  );
}
