'use client';

import {
  SiteDesignSystemResponseSchema,
  type DesignScalarToken,
  type SiteDesignSystem,
  type TypographyToken,
} from '@payload/contracts';
import { useEffect, useState } from 'react';

import { ApiClientError, api } from '../lib/api';
import { ColorField } from '../ui/fields';

type DesignSystemViewProps = {
  workspaceId: string;
  siteId: string;
  canUpdate: boolean;
};

const scalarCategories = [
  ['colors', 'Colors'],
  ['spacing', 'Spacing'],
  ['radii', 'Radius'],
  ['shadows', 'Shadows'],
  ['containerWidths', 'Container widths'],
] as const;

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
}: DesignSystemViewProps) {
  const [system, setSystem] = useState<SiteDesignSystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .get(`/workspaces/${workspaceId}/sites/${siteId}/design-system`)
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
            `/workspaces/${workspaceId}/sites/${siteId}/design-system`,
            system,
          ),
        ).draft,
      );
      setNotice('Design system draft saved. Publish the site to make tokens public.');
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

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">Site foundation</span>
          <h1>Design system</h1>
          <p className="muted">
            Stable token ids keep page styles portable when names change.
          </p>
        </div>
        {canUpdate ? (
          <button
            className="button button-primary"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
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
      <div className="grid grid-2">
        {scalarCategories.map(([category, label]) => (
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
      </div>
    </section>
  );
}
