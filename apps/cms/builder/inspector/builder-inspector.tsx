'use client';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_GROUPS,
  type Asset,
  type ComponentPropertyDefinition,
} from '@payload/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import type { BuilderViewport } from '../builder-adapter';
import type { SelectedBuilderNode } from '../grapes-editor';
import { resolveInspectorStyleValue } from './inspector-value';
import { CUSTOM_PROPERTY_EDITORS } from './custom-property-editors';
import { PropertyControlRenderer } from './property-control-renderer';

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
  updateSelectedStyle: (property: string, value: string) => void;
  resetSelectedStyle: (property: string) => void;
  onSelectNode: (nodeId: string) => void;
  onAddStructuralChild: () => void;
  onRemoveStructuralChild: (nodeId: string) => void;
  onMoveStructuralChild: (nodeId: string, direction: 'up' | 'down') => void;
  usableAssets: Asset[];
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
  onSelectNode,
  onAddStructuralChild,
  onRemoveStructuralChild,
  onMoveStructuralChild,
  usableAssets,
}: BuilderInspectorProps) {
  const [contentSectionsOpen, setContentSectionsOpen] = useState(openSections.content);

  useEffect(() => setContentSectionsOpen(openSections.content), [openSections.content]);

  const definition = PAGE_COMPONENT_REGISTRY[selected.type];
  const contentProperties = definition.propertiesSchema.filter(
    (property) => property.group === 'content',
  );
  const structuralSlot = definition.slots.find((slot) => slot.structural);
  const structuralChildren = structuralSlot
    ? selected.children.filter((child) => structuralSlot.accepts.includes(child.type))
    : [];

  function renderProperty(property: ComponentPropertyDefinition, value: unknown) {
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
      <PropertyControlRenderer
        assetKind={property.assetKind}
        assets={usableAssets}
        definition={property}
        key={property.key}
        onChange={(nextValue) => updateSelectedProperty(property.key, nextValue)}
        value={value}
      />
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
            );
            const hasOverride =
              resolved.authoredValue !== undefined && viewport !== 'desktop';
            return (
              <div className="builder-inspector-field-stack" key={field.key}>
                <PropertyControlRenderer
                  definition={field}
                  description={inheritedDescription(field, resolved)}
                  onChange={(nextValue) =>
                    updateSelectedStyle(field.key, String(nextValue ?? ''))
                  }
                  value={resolved.effectiveValue ?? ''}
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

      {inspectorTab === 'content' && structuralSlot ? (
        <InspectorSection label={structuralSlot.label} onToggle={() => undefined} open>
          <div className="builder-structural-editor">
            {structuralChildren.map((child, index) => (
              <div className="builder-structural-row" key={child.id}>
                <button
                  className="button button-ghost builder-structural-select"
                  onClick={() => onSelectNode(child.id)}
                  type="button"
                >
                  {child.label}
                </button>
                <div className="row-actions">
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
                    disabled={index === structuralChildren.length - 1}
                    onClick={() => onMoveStructuralChild(child.id, 'down')}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    aria-label={`Remove ${child.label}`}
                    className="button button-danger button-small"
                    disabled={
                      structuralSlot.minChildren !== undefined &&
                      structuralChildren.length <= structuralSlot.minChildren
                    }
                    onClick={() => onRemoveStructuralChild(child.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              className="button button-secondary button-small"
              disabled={
                structuralSlot.maxChildren !== undefined &&
                structuralChildren.length >= structuralSlot.maxChildren
              }
              onClick={onAddStructuralChild}
              type="button"
            >
              + {structuralSlot.addLabel ?? `Add ${structuralSlot.label}`}
            </button>
          </div>
        </InspectorSection>
      ) : null}

      {inspectorTab === 'style' ? (
        <>{inspectorStyleSections.map((section) => renderStyleSection(section))}</>
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
