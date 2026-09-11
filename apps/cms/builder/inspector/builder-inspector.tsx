'use client';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_GROUPS,
  getOpenCompositionAuthoringDefinition,
  OPEN_COMPOSITION_REGISTRY,
  isComponentPropertyVisible,
  type Asset,
  type Collection,
  type ComponentPropertyDefinition,
  type PageBinding,
  type PageComponentType,
  type PageCompositionFields,
  type Page,
  type PageQuery,
  type OpenCompositionNodeType,
  type OpenCompositionAuthoringStyleGroup,
  type SiteDesignSystem,
  type StyleTokenReference,
  queryOperatorsForFieldType,
} from '@payload/contracts';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { newBuilderUuid, type BuilderViewport } from '../builder-block/builder-adapter';
import type { SelectedBuilderNode } from '../grapes-editor';
import { resolveInspectorStyleValue } from './inspector-value';
import { CUSTOM_PROPERTY_EDITORS } from './custom-property-editors';
import { PropertyControlRenderer } from './property-control-renderer';
import { StructureEditor } from '../builder-block/structure-editor/structure-editor';
import type { LayoutSelection } from '../../app/ui/fields';
import {
  type BuilderValidationIssue,
  type BuilderValidationScope,
} from '../builder-validation';

export type InspectorTab = 'content' | 'style' | 'settings';

const friendlyStyleLabels: Readonly<Record<string, string>> = {
  'align-items': 'Vertical alignment',
  gap: 'Space between items',
  'justify-content': 'Horizontal alignment',
  margin: 'Outside spacing',
  padding: 'Inside spacing',
};

function friendlyStyleDefinition(
  definition: ComponentPropertyDefinition,
): ComponentPropertyDefinition {
  const label = friendlyStyleLabels[definition.key];
  return label ? { ...definition, label } : definition;
}

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
  workspaceId: string;
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
  onAddStructuralChild: (
    slotName?: string,
    childType?: PageComponentType | OpenCompositionNodeType,
  ) => void;
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
  navigationPages?: readonly Pick<Page, 'id' | 'name' | 'path' | 'anchors'>[];
  validationIssues?: readonly BuilderValidationIssue[];
  validationScope?: BuilderValidationScope;
  onValidationIssue?:
    ((issue: BuilderValidationIssue | null, issueId?: string) => void) | undefined;
  focusPartName?: string | undefined;
  /** `null` targets the block itself; a name scopes the Inspector to that part. */
  styleTargetPartName?: string | null | undefined;
  collections?: readonly Collection[];
  composition?: PageCompositionFields;
  onUpdateBinding?: (binding: PageBinding | null) => void;
  onUpdateQuery?: (query: PageQuery) => void;
  currentEntryCollection?: Collection | undefined;
  allowCurrentEntry?: boolean | undefined;
  contentOnly?: boolean;
};

function OpenCompositionInspector({
  workspaceId,
  selected,
  viewport,
  inspectorTab,
  onInspectorTabChange,
  updateSelectedProperty,
  updateSelectedStyle,
  resetSelectedStyle,
  onSelectNode,
  onRemoveStructuralChild,
  onMoveStructuralChild,
  onDuplicateStructuralChild,
  onAddStructuralChild,
  usableAssets,
  designSystem,
  navigationPages = [],
  validationIssues = [],
  validationScope = 'page',
  onValidationIssue,
  openSections,
  onToggleSection,
  contentOnly,
}: Pick<
  BuilderInspectorProps,
  | 'selected'
  | 'workspaceId'
  | 'viewport'
  | 'inspectorTab'
  | 'onInspectorTabChange'
  | 'updateSelectedProperty'
  | 'updateSelectedStyle'
  | 'resetSelectedStyle'
  | 'onSelectNode'
  | 'onRemoveStructuralChild'
  | 'onMoveStructuralChild'
  | 'onDuplicateStructuralChild'
  | 'onAddStructuralChild'
  | 'usableAssets'
  | 'designSystem'
  | 'navigationPages'
  | 'validationIssues'
  | 'validationScope'
  | 'onValidationIssue'
  | 'openSections'
  | 'onToggleSection'
  | 'contentOnly'
>) {
  const nodeType = selected.openComposition?.nodeType;
  if (!nodeType) return null;
  const definition = getOpenCompositionAuthoringDefinition(nodeType);
  const [addType, setAddType] = useState<OpenCompositionNodeType | ''>('');
  const contentProperties = definition.properties.filter((property) =>
    isComponentPropertyVisible(property, selected.props),
  );
  const addableChildren = OPEN_COMPOSITION_REGISTRY[nodeType].allowedChildren.filter(
    (type) =>
      !['root', 'reusable-instance'].includes(type) &&
      [
        'form-field',
        'label',
        'input',
        'textarea',
        'select',
        'text',
        'heading',
        'button',
        'container',
        'stack',
        'row',
        'grid',
        'image',
      ].includes(type),
  );
  const styleValues = Object.fromEntries(
    definition.styleGroups.flatMap((group) =>
      group.properties.map((property) => [
        property.key,
        resolveInspectorStyleValue(selected.style, property.key, viewport, designSystem)
          .effectiveValue ?? '',
      ]),
    ),
  );

  function contentIssue(property: ComponentPropertyDefinition) {
    return validationIssues.find(
      (candidate) =>
        candidate.nodeId === selected.id &&
        candidate.field === property.key &&
        candidate.tab === 'content' &&
        candidate.scope === validationScope &&
        candidate.viewport === viewport,
    );
  }

  function renderContentProperty(property: ComponentPropertyDefinition) {
    return (
      <PropertyControlRenderer
        assets={usableAssets}
        definition={property}
        navigationPages={navigationPages}
        nodeId={selected.id}
        onChange={(value) => updateSelectedProperty(property.key, value)}
        onValidationIssue={onValidationIssue}
        propertyValues={selected.props}
        scope={validationScope}
        tab="content"
        value={selected.props[property.key]}
        viewport={viewport}
        workspaceId={workspaceId}
        issue={contentIssue(property)}
      />
    );
  }

  function renderStyleGroup(group: OpenCompositionAuthoringStyleGroup) {
    const fields = group.properties.filter(
      (property) =>
        !contentOnly &&
        isComponentPropertyVisible(property, { ...selected.props, ...styleValues }),
    );
    if (fields.length === 0) return null;
    return (
      <InspectorSection
        key={group.key}
        label={group.label}
        onToggle={(open) => onToggleSection(group.key, open)}
        open={openSections[group.key]}
      >
        {group.description ? <p className="muted small">{group.description}</p> : null}
        <div className="builder-inspector-fields">
          {fields.map((property) => {
            const resolved = resolveInspectorStyleValue(
              selected.style,
              property.key,
              viewport,
              designSystem,
            );
            const issue = validationIssues.find(
              (candidate) =>
                candidate.nodeId === selected.id &&
                candidate.field === property.key &&
                candidate.tab === 'style' &&
                candidate.scope === validationScope &&
                candidate.viewport === viewport &&
                candidate.section === group.key,
            );
            return (
              <div className="builder-inspector-field-stack" key={property.key}>
                <PropertyControlRenderer
                  definition={property}
                  description={
                    resolved.inherited && resolved.sourceViewport
                      ? `Inherited from ${resolved.sourceViewport.charAt(0).toUpperCase()}${resolved.sourceViewport.slice(1)}`
                      : property.description
                  }
                  layoutDirection={
                    property.control === 'layout'
                      ? String(styleValues['flex-direction'] ?? '')
                      : undefined
                  }
                  nodeId={selected.id}
                  onChange={(value) => {
                    if (property.control === 'layout' && isLayoutSelection(value)) {
                      updateSelectedStyle('display', value.display);
                      updateSelectedStyle('flex-direction', value.flexDirection ?? '');
                    } else {
                      updateSelectedStyle(property.key, String(value ?? ''));
                    }
                  }}
                  onValidationIssue={onValidationIssue}
                  propertyValues={{ ...selected.props, ...styleValues }}
                  scope={validationScope}
                  section={group.key}
                  tab="style"
                  value={resolved.effectiveValue ?? ''}
                  viewport={viewport}
                  issue={issue}
                />
                {resolved.authoredValue !== undefined ? (
                  <button
                    aria-label={`Reset ${property.label} override`}
                    className="button button-small button-ghost builder-reset-override"
                    onClick={() => resetSelectedStyle(property.key)}
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

  const structure = selected.children.length > 0 || addableChildren.length > 0;

  return (
    <div className="builder-inspector">
      <div aria-label="Inspector tabs" className="builder-inspector-tabs" role="tablist">
        {(['content', 'style', 'settings'] as const).map((tab) => (
          <button
            aria-label={
              tab === 'settings' ? 'Settings' : tab === 'style' ? 'Style' : 'Content'
            }
            aria-selected={inspectorTab === tab}
            className={inspectorTab === tab ? 'is-active' : ''}
            key={tab}
            onClick={() => onInspectorTabChange(tab)}
            role="tab"
            type="button"
          >
            {tab === 'style' ? 'Appearance' : tab === 'settings' ? 'Advanced' : 'Content'}
          </button>
        ))}
      </div>

      {inspectorTab === 'content' ? (
        <>
          <InspectorSection
            label="Content"
            onToggle={(open) => onToggleSection('content', open)}
            open={openSections.content}
          >
            {contentProperties.length > 0 ? (
              <div className="builder-inspector-fields">
                {definition.properties
                  .filter((property) =>
                    isComponentPropertyVisible(property, selected.props),
                  )
                  .map((property) => (
                    <div key={property.key}>{renderContentProperty(property)}</div>
                  ))}
              </div>
            ) : (
              <p className="muted small">
                This {definition.label.toLowerCase()} is ready. Add content inside it
                using the structure below.
              </p>
            )}
          </InspectorSection>
          {structure ? (
            <InspectorSection label="Structure" onToggle={() => undefined} open>
              {addableChildren.length > 0 ? (
                <div className="builder-inspector-inline-row">
                  <select
                    aria-label={`Add content to ${definition.label}`}
                    onChange={(event) =>
                      setAddType(event.target.value as OpenCompositionNodeType | '')
                    }
                    value={addType}
                  >
                    <option value="">Choose content to add</option>
                    {addableChildren.map((type) => (
                      <option key={type} value={type}>
                        {OPEN_COMPOSITION_REGISTRY[type].label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button button-small button-secondary"
                    disabled={!addType}
                    onClick={() => {
                      if (!addType) return;
                      onAddStructuralChild(undefined, addType);
                      setAddType('');
                    }}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              ) : null}
              <div className="builder-structural-editor">
                {selected.children.map((child, index) => (
                  <div className="builder-structure-item" key={child.id}>
                    <button
                      className="button button-ghost button-small"
                      onClick={() => onSelectNode(child.id)}
                      type="button"
                    >
                      {child.label}
                    </button>
                    <span className="builder-structure-item-actions">
                      <button
                        aria-label={`Move ${child.label} up`}
                        className="button button-ghost button-small"
                        disabled={index === 0}
                        onClick={() => onMoveStructuralChild(child.id, 'up')}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${child.label} down`}
                        className="button button-ghost button-small"
                        disabled={index === selected.children.length - 1}
                        onClick={() => onMoveStructuralChild(child.id, 'down')}
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Duplicate ${child.label}`}
                        className="button button-ghost button-small"
                        onClick={() => onDuplicateStructuralChild(child.id)}
                        type="button"
                      >
                        Copy
                      </button>
                      <button
                        aria-label={`Remove ${child.label}`}
                        className="button button-ghost button-small"
                        onClick={() => onRemoveStructuralChild(child.id)}
                        type="button"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </InspectorSection>
          ) : null}
        </>
      ) : null}

      {!contentOnly && inspectorTab === 'style'
        ? definition.styleGroups.map(renderStyleGroup)
        : null}

      {!contentOnly && inspectorTab === 'settings' ? (
        <InspectorSection
          label="Advanced"
          onToggle={(open) => onToggleSection('advanced', open)}
          open={openSections.advanced}
        >
          <div className="builder-inspector-advanced">
            <span className="muted small">Stable element ID</span>
            <code>{selected.id}</code>
            <span className="muted small">Internal type: {nodeType}</span>
          </div>
        </InspectorSection>
      ) : null}
    </div>
  );
}

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

function isLayoutSelection(value: unknown): value is LayoutSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { display?: unknown; flexDirection?: unknown };
  return (
    typeof candidate.display === 'string' &&
    (candidate.flexDirection === undefined ||
      candidate.flexDirection === 'row' ||
      candidate.flexDirection === 'column')
  );
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
            {token.name}
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

function LegacyBuilderInspector({
  workspaceId,
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
  navigationPages = [],
  validationIssues = [],
  validationScope = 'page',
  onValidationIssue,
  focusPartName,
  styleTargetPartName,
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
  const partNames = useMemo(
    () => Object.keys(definition.componentParts),
    [selected.type],
  );
  const [selectedPart, setSelectedPart] = useState(partNames[0] ?? '');
  const focusedPartName =
    (typeof styleTargetPartName === 'string'
      ? styleTargetPartName
      : styleTargetPartName === undefined
        ? focusPartName
        : undefined) ?? undefined;
  const isPartStyleScope =
    focusedPartName !== undefined && partNames.includes(focusedPartName);
  const isBlockStyleScope = styleTargetPartName === null;

  useEffect(() => setContentSectionsOpen(openSections.content), [openSections.content]);
  useEffect(
    () =>
      setSelectedPart(
        Object.keys(PAGE_COMPONENT_REGISTRY[selected.type].componentParts)[0] ?? '',
      ),
    [selected.type],
  );
  useEffect(() => {
    if (isPartStyleScope) setSelectedPart(focusedPartName);
  }, [focusedPartName, isPartStyleScope]);

  const contentProperties = definition.propertiesSchema.filter(
    (property) =>
      property.group === 'content' &&
      (!contentOnly || property.editingScope === 'content') &&
      isComponentPropertyVisible(property, selected.props),
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
          navigationPages={navigationPages}
          onChange={(nextValue) =>
            property.customEditor === 'navigation' &&
            nextValue &&
            typeof nextValue === 'object' &&
            'items' in nextValue
              ? updateSelectedProperty(
                  property.key,
                  (nextValue as { items?: unknown }).items ?? [],
                )
              : updateSelectedProperty(property.key, nextValue)
          }
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
          navigationPages={navigationPages}
          propertyValues={selected.props}
          onChange={(nextValue) => updateSelectedProperty(property.key, nextValue)}
          issue={issue}
          nodeId={selected.id}
          onValidationIssue={onValidationIssue}
          scope={validationScope}
          section="content"
          tab="content"
          value={value}
          workspaceId={workspaceId}
          viewport={viewport}
        />
        {!contentOnly &&
        property.bindable &&
        onUpdateBinding &&
        (allowCurrentEntry ||
          composition?.bindings.some(
            (binding) =>
              binding.targetNodeId === selected.id &&
              binding.targetProperty === property.key,
          )) ? (
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
      <div className="builder-inspector">
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
      </div>
    );
  }

  function renderStyleSection(section: InspectorStyleSection) {
    const allowed = new Set(
      definition.propertiesSchema
        .filter((property) => property.group === 'style')
        .map((property) => property.key),
    );
    const fields = section.fields.filter((field) => allowed.has(field.key));
    const styleValues = Object.fromEntries(
      inspectorStyleSections.flatMap((candidate) =>
        candidate.fields.map((field) => [
          field.key,
          resolveInspectorStyleValue(selected.style, field.key, viewport, designSystem)
            .effectiveValue ?? '',
        ]),
      ),
    );
    const visibleFields = fields.filter((field) =>
      isComponentPropertyVisible(field, { ...selected.props, ...styleValues }),
    );
    if (visibleFields.length === 0) return null;
    return (
      <InspectorSection
        key={section.key}
        label={section.label}
        onToggle={(open) => onToggleSection(section.key, open)}
        open={openSections[section.key]}
      >
        <div className="builder-inspector-fields">
          {visibleFields.map((field) => {
            const resolved = resolveInspectorStyleValue(
              selected.style,
              field.key,
              viewport,
              designSystem,
            );
            const hasOverride = resolved.authoredValue !== undefined;
            const friendlyField = friendlyStyleDefinition(field);
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
                  definition={friendlyField}
                  description={inheritedDescription(field, resolved)}
                  propertyValues={{ ...selected.props, ...styleValues }}
                  layoutDirection={
                    field.control === 'layout'
                      ? String(styleValues['flex-direction'] ?? '')
                      : undefined
                  }
                  layoutSupportsDirection
                  onChange={(nextValue) => {
                    if (field.control === 'layout' && isLayoutSelection(nextValue)) {
                      updateSelectedStyle('display', nextValue.display);
                      updateSelectedStyle(
                        'flex-direction',
                        nextValue.flexDirection ?? '',
                      );
                    } else {
                      updateSelectedStyle(field.key, String(nextValue ?? ''));
                    }
                  }}
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
                    aria-label={`Reset ${friendlyField.label} override`}
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
    const partStyleValues = Object.fromEntries(
      fields.map((field) => [
        field.key,
        resolveInspectorStyleValue(
          selected.partsStyle?.[selectedPart],
          field.key,
          viewport,
          designSystem,
        ).effectiveValue ?? '',
      ]),
    );
    const visibleFields = fields.filter((field) =>
      isComponentPropertyVisible(field, { ...selected.props, ...partStyleValues }),
    );
    return (
      <InspectorSection label="Component part" onToggle={() => undefined} open>
        <div className="builder-component-part-picker">
          <span className="builder-component-part-picker-label">Style target</span>
          <div aria-label="Style target" className="builder-component-part-targets">
            {partNames.map((name) => (
              <button
                aria-pressed={selectedPart === name}
                className={`button button-small builder-component-part-target${
                  selectedPart === name ? ' is-active' : ''
                }`}
                key={name}
                onClick={() => setSelectedPart(name)}
                type="button"
              >
                {definition.componentParts[name]?.label ?? name}
              </button>
            ))}
          </div>
          <p className="muted small">
            These styles apply only to every matching {part.label.toLowerCase()} in this{' '}
            {definition.label.toLowerCase()}.
          </p>
        </div>
        <div className="builder-inspector-fields">
          {visibleFields.map((field) => {
            const resolved = resolveInspectorStyleValue(
              selected.partsStyle?.[selectedPart],
              field.key,
              viewport,
              designSystem,
            );
            const hasOverride = resolved.authoredValue !== undefined;
            const friendlyField = friendlyStyleDefinition(field);
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
                  definition={friendlyField}
                  description={inheritedDescription(field, resolved)}
                  propertyValues={{ ...selected.props, ...partStyleValues }}
                  layoutDirection={
                    field.control === 'layout'
                      ? String(
                          resolveInspectorStyleValue(
                            selected.partsStyle?.[selectedPart],
                            'flex-direction',
                            viewport,
                            designSystem,
                          ).effectiveValue ?? '',
                        )
                      : undefined
                  }
                  layoutSupportsDirection={part.styleCapabilities.includes(
                    'flex-direction',
                  )}
                  onChange={(nextValue) => {
                    if (field.control === 'layout' && isLayoutSelection(nextValue)) {
                      updateSelectedPartStyle(selectedPart, 'display', nextValue.display);
                      if (part.styleCapabilities.includes('flex-direction')) {
                        updateSelectedPartStyle(
                          selectedPart,
                          'flex-direction',
                          nextValue.flexDirection ?? '',
                        );
                      }
                    } else {
                      updateSelectedPartStyle(
                        selectedPart,
                        field.key,
                        String(nextValue ?? ''),
                      );
                    }
                  }}
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
                    aria-label={`Reset ${friendlyField.label} override`}
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
    <div className="builder-inspector">
      <div aria-label="Inspector tabs" className="builder-inspector-tabs" role="tablist">
        {(['content', 'style', 'settings'] as const).map((tab) => (
          <button
            aria-label={
              tab === 'settings' ? 'Settings' : tab === 'style' ? 'Style' : 'Content'
            }
            aria-selected={inspectorTab === tab}
            className={inspectorTab === tab ? 'is-active' : ''}
            key={tab}
            onClick={() => onInspectorTabChange(tab)}
            role="tab"
            type="button"
          >
            {tab === 'style' ? 'Appearance' : tab === 'settings' ? 'Advanced' : 'Content'}
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
        <InspectorSection label="Content source" onToggle={() => undefined} open>
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
          {!isPartStyleScope
            ? inspectorStyleSections.map((section) => renderStyleSection(section))
            : null}
          {!isBlockStyleScope && partNames.length > 0 ? renderPartStyleEditor() : null}
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
    </div>
  );
}

export function BuilderInspector(props: BuilderInspectorProps) {
  if (props.selected.openComposition) {
    return (
      <OpenCompositionInspector
        contentOnly={props.contentOnly ?? false}
        {...(props.designSystem ? { designSystem: props.designSystem } : {})}
        inspectorTab={props.inspectorTab}
        {...(props.navigationPages ? { navigationPages: props.navigationPages } : {})}
        onAddStructuralChild={props.onAddStructuralChild}
        onDuplicateStructuralChild={props.onDuplicateStructuralChild}
        onInspectorTabChange={props.onInspectorTabChange}
        onMoveStructuralChild={props.onMoveStructuralChild}
        onRemoveStructuralChild={props.onRemoveStructuralChild}
        onSelectNode={props.onSelectNode}
        onValidationIssue={props.onValidationIssue}
        onToggleSection={props.onToggleSection}
        openSections={props.openSections}
        resetSelectedStyle={props.resetSelectedStyle}
        selected={props.selected}
        updateSelectedProperty={props.updateSelectedProperty}
        updateSelectedStyle={props.updateSelectedStyle}
        usableAssets={props.usableAssets}
        {...(props.validationIssues ? { validationIssues: props.validationIssues } : {})}
        validationScope={props.validationScope ?? 'page'}
        viewport={props.viewport}
        workspaceId={props.workspaceId}
      />
    );
  }
  return <LegacyBuilderInspector {...props} />;
}
