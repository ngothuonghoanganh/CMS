'use client';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_GROUPS,
  type Asset,
  type Collection,
  type ComponentPropertyDefinition,
  type PageBinding,
  type PageComponentType,
  type PageCompositionFields,
  type PageQuery,
  type SiteDesignSystem,
  type StyleTokenReference,
  queryOperatorsForFieldType,
} from '@payload/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import { newBuilderUuid, type BuilderViewport } from '../builder-adapter';
import type { SelectedBuilderNode } from '../grapes-editor';
import { resolveInspectorStyleValue } from './inspector-value';
import { CUSTOM_PROPERTY_EDITORS } from './custom-property-editors';
import { PropertyControlRenderer } from './property-control-renderer';
import { StructureEditor } from './structure-editor/structure-editor';
import {
  type BuilderValidationIssue,
  type BuilderValidationScope,
} from '../builder-validation';

export type InspectorTab = 'content' | 'style' | 'settings';

export type InspectorSectionKey =
  | 'content'
  | 'layout'
  | 'size'
  | 'spacing'
  | 'typography'
  | 'background'
  | 'border'
  | 'effects'
  | 'advanced';

type InspectorStyleSection = {
  key: Exclude<InspectorSectionKey, 'content' | 'advanced'>;
  label: string;
  fields: readonly ComponentPropertyDefinition[];
};

type BuilderInspectorProps = {
  selected: SelectedBuilderNode;
  viewport: BuilderViewport;
  inspectorTab: InspectorTab;
  onInspectorTabChange: (tab: InspectorTab) => void;
  openSections: Record<InspectorSectionKey, boolean>;
  onToggleSection: (section: InspectorSectionKey, open: boolean) => void;
  updateSelectedProperty: (property: string, value: unknown) => void;
  updateSelectedStyle: (property: string, value: string | StyleTokenReference) => void;
  resetSelectedStyle: (property: string) => void;
  updateSelectedPartStyle: (
    partName: string,
    property: string,
    value: string | StyleTokenReference,
  ) => void;
  resetSelectedPartStyle: (partName: string, property: string) => void;
  onSelectNode: (nodeId: string) => void;
  onAddStructuralChild: (slotName?: string, childType?: PageComponentType) => void;
  onRemoveStructuralChild: (nodeId: string) => void;
  onMoveStructuralChild: (nodeId: string, direction: 'up' | 'down') => void;
  onReorderStructuralChild: (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => void;
  onDuplicateStructuralChild: (nodeId: string) => void;
  usableAssets: Asset[];
  designSystem?: SiteDesignSystem;
  navigationItemCount?: number;
  onEditNavigation?: () => void;
  validationIssues?: readonly BuilderValidationIssue[];
  validationScope?: BuilderValidationScope;
  onValidationIssue?:
    ((issue: BuilderValidationIssue | null, issueId?: string) => void) | undefined;
  focusPartName?: string | undefined;
  collections?: readonly Collection[];
  composition?: PageCompositionFields;
  onUpdateBinding?: (binding: PageBinding | null) => void;
  onUpdateQuery?: (query: PageQuery) => void;
  currentEntryCollection?: Collection | undefined;
  allowCurrentEntry?: boolean | undefined;
  contentOnly?: boolean;
};

const inspectorStyleSections: readonly InspectorStyleSection[] = (
  Object.entries(PAGE_STYLE_PROPERTY_GROUPS) as Array<
    [InspectorStyleSection['key'], readonly ComponentPropertyDefinition[]]
  >
).map(([key, fields]) => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
  fields,
}));

type TokenCategory = keyof Pick<
  SiteDesignSystem,
  'colors' | 'typography' | 'spacing' | 'radii' | 'shadows' | 'containerWidths'
>;

function tokenCategoryForProperty(property: string): TokenCategory | undefined {
  if (
    property === 'color' ||
    property === 'background-color' ||
    property === 'border-color'
  ) {
    return 'colors';
  }
  if (['padding', 'margin', 'gap'].includes(property)) return 'spacing';
  if (property === 'border-radius') return 'radii';
  if (property === 'box-shadow') return 'shadows';
  if (property === 'max-width') return 'containerWidths';
  if (
    ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing'].includes(
      property,
    )
  ) {
    return 'typography';
  }
  return undefined;
}

function TokenChoice({
  category,
  designSystem,
  value,
  property,
  onChange,
}: {
  category: TokenCategory;
  designSystem: SiteDesignSystem;
  value: ReturnType<typeof resolveInspectorStyleValue>;
  property: string;
  onChange: (nextValue: string | StyleTokenReference) => void;
}) {
  const tokens = designSystem[category];
  const currentTokenId =
    typeof value.effectiveRawValue === 'object' ? value.effectiveRawValue.tokenId : '';
  return (
    <label className="builder-inspector-field">
      <span>{category === 'typography' ? 'Typography token' : `${property} token`}</span>
      <select
        aria-label={`${property} design token`}
        onChange={(event) => {
          const tokenId = event.target.value;
          onChange(tokenId ? { kind: 'token', tokenId } : (value.effectiveValue ?? ''));
        }}
        value={currentTokenId}
      >
        <option value="">Custom value</option>
        {tokens.map((token) => (
          <option key={token.id} value={token.id}>
            {token.name} ({token.id})
          </option>
        ))}
      </select>
    </label>
  );
}

function InspectorSection({
  children,
  label,
  onToggle,
  open,
}: {
  children: ReactNode;
  label: string;
  onToggle: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <details
      className="builder-inspector-section"
      onToggle={(event) => onToggle(event.currentTarget.open)}
      open={open}
    >
      <summary>{label}</summary>
      <div className="builder-inspector-section-body">{children}</div>
    </details>
  );
}

function inheritedDescription(
  definition: ComponentPropertyDefinition,
  resolved: ReturnType<typeof resolveInspectorStyleValue>,
): string | undefined {
  if (resolved.inherited && resolved.sourceViewport) {
    return `Inherited from ${resolved.sourceViewport.charAt(0).toUpperCase()}${resolved.sourceViewport.slice(1)}`;
  }
  return definition.description;
}

const bindingSourceLabels = {
  static: 'Static value',
  'current-entry': 'Current entry',
  query: 'First collection result',
  'query-item': 'Collection item',
} as const;

function queryCollection(
  query: PageQuery | undefined,
  collections: readonly Collection[],
): Collection | undefined {
  if (!query) return undefined;
  const source = query.source;
  if (source.type !== 'collection') return undefined;
  return collections.find((collection) => collection.id === source.collectionId);
}

function queryFilterInputValue(
  fieldType: Collection['fields'][number]['type'] | undefined,
  value: string,
  listValue = false,
): string | number | boolean | Array<string | number | boolean> {
  if (listValue) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => queryFilterInputValue(fieldType, item) as string | number | boolean);
  }
  if (fieldType === 'number' && value.trim() !== '') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : value;
  }
  if (fieldType === 'boolean' && (value === 'true' || value === 'false')) {
    return value === 'true';
  }
  return value;
}

function CollectionQueryEditor({
  selected,
  collections,
  query,
  onChange,
}: {
  selected: SelectedBuilderNode;
  collections: readonly Collection[];
  query?: PageQuery | undefined;
  onChange: (query: PageQuery) => void;
}) {
  const queryId =
    typeof selected.props.queryId === 'string' ? selected.props.queryId : '';
  const collection = queryCollection(query, collections);
  const activeFields =
    collection?.fields.filter((field) => field.status === 'active') ?? [];
  const update = (patch: Partial<PageQuery>) => {
    if (!query) return;
    onChange({ ...query, ...patch });
  };
  const ensureQuery = (collectionId: string) => {
    if (!collectionId || !queryId) return;
    onChange({
      id: queryId,
      source: { type: 'collection', collectionId },
      filters: query?.filters ?? [],
      sort: query?.sort ?? [],
      limit: query?.limit ?? 20,
      offset: query?.offset ?? 0,
    });
  };
  const addFilter = () => {
    if (!query || !activeFields[0]) return;
    const operators = queryOperatorsForFieldType(activeFields[0].type);
    const operator = operators[0] ?? 'equals';
    const defaultValue =
      activeFields[0].type === 'number'
        ? 0
        : activeFields[0].type === 'boolean'
          ? false
          : '';
    update({
      filters: [
        ...query.filters,
        {
          field: activeFields[0].key,
          operator,
          ...(operator === 'exists' ? {} : { value: defaultValue }),
        },
      ],
    });
  };
  const updateFilter = (index: number, patch: Partial<PageQuery['filters'][number]>) => {
    if (!query) return;
    update({
      filters: query.filters.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, ...patch } : filter,
      ),
    });
  };

  return (
    <div className="builder-inspector-fields" data-builder-query-editor>
      <label className="builder-inspector-field">
        <span>Collection source</span>
        <select
          aria-label="Collection source"
          onChange={(event) => ensureQuery(event.target.value)}
          value={collection?.id ?? ''}
        >
          <option value="">Choose a collection</option>
          {collections.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>
      {query && collection ? (
        <>
          <div className="builder-inspector-field-stack">
            <span className="muted small">Filters</span>
            {query.filters.map((filter, index) => (
              <div
                className="builder-inspector-inline-row"
                key={`${filter.field}-${index}`}
              >
                <select
                  aria-label={`Filter ${index + 1} field`}
                  onChange={(event) => {
                    const field = activeFields.find(
                      (candidate) => candidate.key === event.target.value,
                    );
                    const operator = field
                      ? (queryOperatorsForFieldType(field.type)[0] ?? 'equals')
                      : 'equals';
                    updateFilter(index, {
                      field: event.target.value,
                      operator,
                      ...(operator === 'exists'
                        ? { value: undefined }
                        : {
                            value:
                              field?.type === 'number'
                                ? 0
                                : field?.type === 'boolean'
                                  ? false
                                  : '',
                          }),
                    });
                  }}
                  value={filter.field}
                >
                  {activeFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Filter ${index + 1} operator`}
                  onChange={(event) => {
                    const operator = event.target
                      .value as PageQuery['filters'][number]['operator'];
                    const nextValue =
                      operator === 'exists'
                        ? undefined
                        : ['in', 'notIn'].includes(operator)
                          ? Array.isArray(filter.value)
                            ? filter.value
                            : filter.value === undefined
                              ? []
                              : [filter.value]
                          : Array.isArray(filter.value)
                            ? filter.value[0]
                            : filter.value;
                    updateFilter(index, { operator, value: nextValue });
                  }}
                  value={filter.operator}
                >
                  {queryOperatorsForFieldType(
                    activeFields.find((field) => field.key === filter.field)?.type ??
                      'text',
                  ).map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
                {filter.operator !== 'exists' ? (
                  activeFields.find((field) => field.key === filter.field)?.type ===
                    'boolean' && !['in', 'notIn'].includes(filter.operator) ? (
                    <select
                      aria-label={`Filter ${index + 1} value`}
                      onChange={(event) =>
                        updateFilter(index, { value: event.target.value === 'true' })
                      }
                      value={String(filter.value ?? false)}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : activeFields.find((field) => field.key === filter.field)?.type ===
                      'select' && !['in', 'notIn'].includes(filter.operator) ? (
                    <select
                      aria-label={`Filter ${index + 1} value`}
                      onChange={(event) =>
                        updateFilter(index, { value: event.target.value })
                      }
                      value={String(filter.value ?? '')}
                    >
                      {(
                        activeFields.find((field) => field.key === filter.field)
                          ?.options ?? []
                      ).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={`Filter ${index + 1} value`}
                      onChange={(event) =>
                        updateFilter(index, {
                          value: queryFilterInputValue(
                            activeFields.find((field) => field.key === filter.field)
                              ?.type,
                            event.target.value,
                            ['in', 'notIn'].includes(filter.operator),
                          ),
                        })
                      }
                      placeholder="Value"
                      value={
                        filter.value === undefined
                          ? ''
                          : Array.isArray(filter.value)
                            ? filter.value.join(', ')
                            : String(filter.value)
                      }
                    />
                  )
                ) : null}
                <button
                  aria-label={`Remove filter ${index + 1}`}
                  className="button button-small button-ghost"
                  onClick={() =>
                    update({ filters: query.filters.filter((_, i) => i !== index) })
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="button button-small button-secondary"
              onClick={addFilter}
              type="button"
            >
              Add filter
            </button>
          </div>
          <div className="builder-inspector-inline-row">
            <label className="builder-inspector-field">
              <span>Sort by</span>
              <select
                aria-label="Sort field"
                onChange={(event) =>
                  update({
                    sort: event.target.value
                      ? [
                          {
                            field: event.target.value,
                            direction: query.sort[0]?.direction ?? 'asc',
                          },
                        ]
                      : [],
                  })
                }
                value={query.sort[0]?.field ?? ''}
              >
                <option value="">Default order</option>
                {activeFields
                  .filter(
                    (field) => !['array', 'group', 'multi-select'].includes(field.type),
                  )
                  .map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
              </select>
            </label>
            {query.sort[0] ? (
              <label className="builder-inspector-field">
                <span>Direction</span>
                <select
                  aria-label="Sort direction"
                  onChange={(event) =>
                    update({
                      sort: [
                        {
                          ...query.sort[0]!,
                          direction: event.target.value as 'asc' | 'desc',
                        },
                      ],
                    })
                  }
                  value={query.sort[0].direction}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            ) : null}
          </div>
          <label className="builder-inspector-field">
            <span>Maximum items</span>
            <input
              aria-label="Maximum items"
              max={100}
              min={1}
              onChange={(event) => update({ limit: Number(event.target.value) || 1 })}
              type="number"
              value={query.limit}
            />
          </label>
        </>
      ) : null}
      {!collections.length ? (
        <p className="muted small">Create a collection first.</p>
      ) : null}
    </div>
  );
}

function BindingEditor({
  selected,
  property,
  binding,
  composition,
  collections,
  onChange,
  currentEntryCollection,
  allowCurrentEntry,
}: {
  selected: SelectedBuilderNode;
  property: ComponentPropertyDefinition;
  binding?: PageBinding | undefined;
  composition?: PageCompositionFields | undefined;
  collections: readonly Collection[];
  onChange: (binding: PageBinding | null) => void;
  currentEntryCollection?: Collection | undefined;
  allowCurrentEntry?: boolean | undefined;
}) {
  const queries = composition?.queries ?? [];
  const sourceType = binding?.source.type ?? 'static';
  const selectedQuery = binding?.source.sourceId
    ? queries.find((query) => query.id === binding.source.sourceId)
    : undefined;
  const collection =
    binding?.source.type === 'current-entry'
      ? currentEntryCollection
      : queryCollection(selectedQuery, collections);
  const fields = collection?.fields.filter((field) => field.status === 'active') ?? [];
  const setSource = (type: 'static' | 'current-entry' | 'query' | 'query-item') => {
    if (type === 'static') {
      onChange(null);
      return;
    }
    const query = queries.find((candidate) => candidate.source.type === 'collection');
    if ((type === 'query-item' || type === 'query') && !query) return;
    const path = binding?.source.path ?? fields[0]?.key ?? 'title';
    onChange({
      id: binding?.id ?? newBuilderUuid(),
      targetNodeId: selected.id,
      targetProperty: property.key,
      source:
        type === 'query-item' || type === 'query'
          ? { type, sourceId: query!.id, path }
          : { type, path },
      ...(binding?.fallback !== undefined ? { fallback: binding.fallback } : {}),
    });
  };
  const updateSource = (patch: Partial<PageBinding['source']>) => {
    if (!binding) return;
    onChange({ ...binding, source: { ...binding.source, ...patch } } as PageBinding);
  };
  const updateTemplate = (template: string) => {
    if (!binding) return;
    onChange({
      ...binding,
      source: {
        ...binding.source,
        template: template.trim() || undefined,
      },
    } as PageBinding);
  };

  return (
    <div className="builder-binding-editor" data-builder-binding-property={property.key}>
      <label className="builder-inspector-field">
        <span>Data source for {property.label}</span>
        <select
          aria-label="Data source"
          onChange={(event) =>
            setSource(
              event.target.value as 'static' | 'current-entry' | 'query' | 'query-item',
            )
          }
          value={sourceType}
        >
          {Object.entries(bindingSourceLabels)
            .filter(([value]) => value !== 'current-entry' || allowCurrentEntry)
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
      {binding ? (
        <>
          {binding.source.type === 'query' || binding.source.type === 'query-item' ? (
            <label className="builder-inspector-field">
              <span>Query</span>
              <select
                aria-label="Binding query"
                onChange={(event) => updateSource({ sourceId: event.target.value })}
                value={binding.source.sourceId ?? ''}
              >
                <option value="">Choose a query</option>
                {queries
                  .filter((query) => query.source.type === 'collection')
                  .map((query) => (
                    <option key={query.id} value={query.id}>
                      {queryCollection(query, collections)?.name ?? query.id}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          <label className="builder-inspector-field">
            <span>Field path</span>
            {fields.length ? (
              <select
                aria-label="Binding field path"
                onChange={(event) => updateSource({ path: event.target.value })}
                value={binding.source.path}
              >
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label="Binding field path"
                onChange={(event) => updateSource({ path: event.target.value })}
                pattern="[A-Za-z][A-Za-z0-9_-]*(\\.[A-Za-z][A-Za-z0-9_-]*)*"
                value={binding.source.path}
              />
            )}
          </label>
          <label className="builder-inspector-field">
            <span>Fallback</span>
            <input
              aria-label="Binding fallback"
              onChange={(event) => onChange({ ...binding, fallback: event.target.value })}
              placeholder={String(selected.props[property.key] ?? '')}
              value={typeof binding.fallback === 'string' ? binding.fallback : ''}
            />
          </label>
          {property.key === 'href' ? (
            <>
              <label className="builder-inspector-field">
                <span>URL template</span>
                <input
                  aria-label="Binding URL template"
                  onChange={(event) => updateTemplate(event.target.value)}
                  placeholder="/products/{value}"
                  value={binding.source.template ?? ''}
                />
              </label>
              <p className="muted small">
                Use {'{value}'} to insert the selected value. Public platform links add
                the current site slug automatically.
              </p>
            </>
          ) : null}
          <button
            className="button button-small button-ghost"
            onClick={() => onChange(null)}
            type="button"
          >
            Remove binding
          </button>
        </>
      ) : null}
    </div>
  );
}

export function BuilderInspector({
  selected,
  viewport,
  inspectorTab,
  onInspectorTabChange,
  openSections,
  onToggleSection,
  updateSelectedProperty,
  updateSelectedStyle,
  resetSelectedStyle,
  updateSelectedPartStyle,
  resetSelectedPartStyle,
  onSelectNode,
  onAddStructuralChild,
  onRemoveStructuralChild,
  onMoveStructuralChild,
  onReorderStructuralChild,
  onDuplicateStructuralChild,
  usableAssets,
  designSystem,
  navigationItemCount = 0,
  onEditNavigation,
  validationIssues = [],
  validationScope = 'page',
  onValidationIssue,
  focusPartName,
  collections = [],
  composition,
  onUpdateBinding,
  onUpdateQuery,
  currentEntryCollection,
  allowCurrentEntry,
  contentOnly = false,
}: BuilderInspectorProps) {
  const [contentSectionsOpen, setContentSectionsOpen] = useState(openSections.content);
  const definition = PAGE_COMPONENT_REGISTRY[selected.type];
  const partNames = Object.keys(definition.componentParts);
  const [selectedPart, setSelectedPart] = useState(partNames[0] ?? '');

  useEffect(() => setContentSectionsOpen(openSections.content), [openSections.content]);
  useEffect(
    () =>
      setSelectedPart(
        Object.keys(PAGE_COMPONENT_REGISTRY[selected.type].componentParts)[0] ?? '',
      ),
    [selected.type],
  );
  useEffect(() => {
    if (focusPartName && partNames.includes(focusPartName))
      setSelectedPart(focusPartName);
  }, [focusPartName, partNames]);

  const contentProperties = definition.propertiesSchema.filter(
    (property) =>
      property.group === 'content' &&
      (!contentOnly || property.editingScope === 'content') &&
      !(selected.type === 'collection-list' && property.key === 'queryId'),
  );

  function renderProperty(property: ComponentPropertyDefinition, value: unknown) {
    const issue = validationIssues.find(
      (candidate) =>
        candidate.nodeId === selected.id &&
        candidate.field === property.key &&
        candidate.tab === 'content' &&
        candidate.scope === validationScope &&
        candidate.viewport === viewport,
    );
    if (property.control === 'custom' && property.customEditor) {
      const Editor = CUSTOM_PROPERTY_EDITORS[property.customEditor];
      return (
        <Editor
          definition={property}
          key={property.key}
          onChange={(nextValue) => updateSelectedProperty(property.key, nextValue)}
          value={selected.props}
        />
      );
    }
    return (
      <div key={property.key} className="builder-inspector-property-stack">
        <PropertyControlRenderer
          assetKind={property.assetKind}
          assets={usableAssets}
          definition={property}
          onChange={(nextValue) => updateSelectedProperty(property.key, nextValue)}
          issue={issue}
          nodeId={selected.id}
          onValidationIssue={onValidationIssue}
          scope={validationScope}
          section="content"
          tab="content"
          value={value}
          viewport={viewport}
        />
        {!contentOnly && property.bindable && onUpdateBinding ? (
          <BindingEditor
            binding={composition?.bindings.find(
              (binding) =>
                binding.targetNodeId === selected.id &&
                binding.targetProperty === property.key,
            )}
            collections={collections}
            composition={composition}
            currentEntryCollection={currentEntryCollection}
            allowCurrentEntry={allowCurrentEntry}
            onChange={onUpdateBinding}
            property={property}
            selected={selected}
          />
        ) : null}
      </div>
    );
  }

  if (contentOnly) {
    return (
      <InspectorSection label="Content" onToggle={() => undefined} open>
        {contentProperties.length > 0 ? (
          <div className="builder-inspector-fields">
            {contentProperties.map((property) =>
              renderProperty(property, selected.props[property.key]),
            )}
          </div>
        ) : (
          <p className="muted small">
            This element has no editable content. Select another text, media, button, or
            content element.
          </p>
        )}
      </InspectorSection>
    );
  }

  function renderStyleSection(section: InspectorStyleSection) {
    const allowed = new Set(
      definition.propertiesSchema
        .filter((property) => property.group === 'style')
        .map((property) => property.key),
    );
    const fields = section.fields.filter((field) => allowed.has(field.key));
    if (fields.length === 0) return null;
    return (
      <InspectorSection
        key={section.key}
        label={section.label}
        onToggle={(open) => onToggleSection(section.key, open)}
        open={openSections[section.key]}
      >
        <div className="builder-inspector-fields">
          {fields.map((field) => {
            const resolved = resolveInspectorStyleValue(
              selected.style,
              field.key,
              viewport,
              designSystem,
            );
            const hasOverride =
              resolved.authoredValue !== undefined && viewport !== 'desktop';
            return (
              <div className="builder-inspector-field-stack" key={field.key}>
                {designSystem && tokenCategoryForProperty(field.key) ? (
                  <TokenChoice
                    category={tokenCategoryForProperty(field.key)!}
                    designSystem={designSystem}
                    onChange={(nextValue) => updateSelectedStyle(field.key, nextValue)}
                    property={field.key}
                    value={resolved}
                  />
                ) : null}
                <PropertyControlRenderer
                  definition={field}
                  description={inheritedDescription(field, resolved)}
                  onChange={(nextValue) =>
                    updateSelectedStyle(field.key, String(nextValue ?? ''))
                  }
                  issue={validationIssues.find(
                    (candidate) =>
                      candidate.nodeId === selected.id &&
                      candidate.field === field.key &&
                      candidate.tab === 'style' &&
                      candidate.scope === validationScope &&
                      candidate.viewport === viewport &&
                      candidate.section === section.key,
                  )}
                  nodeId={selected.id}
                  onValidationIssue={onValidationIssue}
                  scope={validationScope}
                  section={section.key}
                  tab="style"
                  value={resolved.effectiveValue ?? ''}
                  viewport={viewport}
                />
                {hasOverride ? (
                  <button
                    aria-label={`Reset ${field.label} override`}
                    className="button button-small button-ghost builder-reset-override"
                    onClick={() => resetSelectedStyle(field.key)}
                    type="button"
                  >
                    Reset override
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </InspectorSection>
    );
  }

  function renderPartStyleEditor() {
    const part = definition.componentParts[selectedPart];
    if (!part) return null;
    const allowed = new Set(part.styleCapabilities);
    const fields = inspectorStyleSections.flatMap((section) =>
      section.fields.filter((field) => allowed.has(field.key as never)),
    );
    return (
      <InspectorSection label="Component part" onToggle={() => undefined} open>
        <label className="builder-inspector-field">
          <span>Target</span>
          <select
            onChange={(event) => setSelectedPart(event.target.value)}
            value={selectedPart}
          >
            {partNames.map((name) => (
              <option key={name} value={name}>
                {definition.componentParts[name]?.label ?? name}
              </option>
            ))}
          </select>
        </label>
        <div className="builder-inspector-fields">
          {fields.map((field) => {
            const resolved = resolveInspectorStyleValue(
              selected.partsStyle?.[selectedPart],
              field.key,
              viewport,
              designSystem,
            );
            const hasOverride =
              resolved.authoredValue !== undefined && viewport !== 'desktop';
            return (
              <div className="builder-inspector-field-stack" key={field.key}>
                {designSystem && tokenCategoryForProperty(field.key) ? (
                  <TokenChoice
                    category={tokenCategoryForProperty(field.key)!}
                    designSystem={designSystem}
                    onChange={(nextValue) =>
                      updateSelectedPartStyle(selectedPart, field.key, nextValue)
                    }
                    property={field.key}
                    value={resolved}
                  />
                ) : null}
                <PropertyControlRenderer
                  definition={field}
                  description={inheritedDescription(field, resolved)}
                  onChange={(nextValue) =>
                    updateSelectedPartStyle(
                      selectedPart,
                      field.key,
                      String(nextValue ?? ''),
                    )
                  }
                  issue={validationIssues.find(
                    (candidate) =>
                      candidate.nodeId === selected.id &&
                      candidate.field === field.key &&
                      candidate.tab === 'style' &&
                      candidate.scope === validationScope &&
                      candidate.viewport === viewport &&
                      candidate.section === 'component-part' &&
                      candidate.partName === selectedPart,
                  )}
                  nodeId={selected.id}
                  onValidationIssue={onValidationIssue}
                  partName={selectedPart}
                  scope={validationScope}
                  section="component-part"
                  tab="style"
                  value={resolved.effectiveValue ?? ''}
                  viewport={viewport}
                />
                {hasOverride ? (
                  <button
                    aria-label={`Reset ${field.label} override`}
                    className="button button-small button-ghost builder-reset-override"
                    onClick={() => resetSelectedPartStyle(selectedPart, field.key)}
                    type="button"
                  >
                    Reset override
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </InspectorSection>
    );
  }

  return (
    <>
      <div aria-label="Inspector tabs" className="builder-inspector-tabs" role="tablist">
        {(['content', 'style', 'settings'] as const).map((tab) => (
          <button
            aria-selected={inspectorTab === tab}
            className={inspectorTab === tab ? 'is-active' : ''}
            key={tab}
            onClick={() => onInspectorTabChange(tab)}
            role="tab"
            type="button"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {inspectorTab === 'content' && contentProperties.length > 0 ? (
        <InspectorSection
          label="Content"
          onToggle={(open) => {
            setContentSectionsOpen(open);
            onToggleSection('content', open);
          }}
          open={contentSectionsOpen}
        >
          <div className="builder-inspector-fields">
            {contentProperties.map((property) =>
              renderProperty(property, selected.props[property.key]),
            )}
          </div>
        </InspectorSection>
      ) : null}

      {inspectorTab === 'content' && selected.type === 'collection-list' ? (
        <InspectorSection label="Collection query" onToggle={() => undefined} open>
          <CollectionQueryEditor
            collections={collections}
            onChange={(query) => onUpdateQuery?.(query)}
            query={composition?.queries?.find(
              (query) => query.id === selected.props.queryId,
            )}
            selected={selected}
          />
        </InspectorSection>
      ) : null}

      {selected.type === 'navigation-view' ? (
        <InspectorSection label="Navigation source" onToggle={() => undefined} open>
          <div className="builder-navigation-source">
            <span className="muted small">Source</span>
            <strong>Site navigation</strong>
            <span className="muted small">
              {navigationItemCount} top-level item{navigationItemCount === 1 ? '' : 's'}
            </span>
            {onEditNavigation ? (
              <button
                className="button button-secondary button-small"
                onClick={onEditNavigation}
                type="button"
              >
                Edit navigation
              </button>
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      {inspectorTab === 'content' ? (
        <StructureEditor
          onAdd={(slotName, childType) => onAddStructuralChild(slotName, childType)}
          onDelete={onRemoveStructuralChild}
          onDuplicate={onDuplicateStructuralChild}
          onMove={onMoveStructuralChild}
          onDrop={onReorderStructuralChild}
          onSelect={onSelectNode}
          selected={selected}
        />
      ) : null}

      {inspectorTab === 'style' ? (
        <>
          {inspectorStyleSections.map((section) => renderStyleSection(section))}
          {partNames.length > 0 ? renderPartStyleEditor() : null}
        </>
      ) : null}

      {inspectorTab === 'settings' ? (
        <>
          <InspectorSection
            label="Element"
            onToggle={(open) => onToggleSection('layout', open)}
            open={openSections.layout}
          >
            <p className="muted small">
              Selection actions are available from the canvas toolbar, Layers, and
              keyboard shortcuts.
            </p>
          </InspectorSection>
          <InspectorSection
            label="Accessibility"
            onToggle={(open) => onToggleSection('background', open)}
            open={openSections.background}
          >
            <p className="muted small">
              Semantic content and labels are edited in the Content tab.
            </p>
          </InspectorSection>
          <InspectorSection
            label="Advanced"
            onToggle={(open) => onToggleSection('advanced', open)}
            open={openSections.advanced}
          >
            <div className="builder-inspector-advanced">
              <span className="muted small">Node ID</span>
              <code>{selected.id}</code>
              <span className="muted small">
                This identifier is stable for this page and is not edited here.
              </span>
            </div>
          </InspectorSection>
        </>
      ) : null}
    </>
  );
}
