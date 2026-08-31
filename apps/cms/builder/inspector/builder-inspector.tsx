'use client';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_GROUPS,
  type Asset,
  type ComponentPropertyDefinition,
  type PageComponentType,
} from '@payload/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import type { BuilderViewport } from '../builder-adapter';
import type { SelectedBuilderNode } from '../grapes-editor';
import { resolveInspectorStyleValue } from './inspector-value';
import { CUSTOM_PROPERTY_EDITORS } from './custom-property-editors';
import { PropertyControlRenderer } from './property-control-renderer';
import { StructureEditor } from './structure-editor/structure-editor';

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
  updateSelectedPartStyle: (partName: string, property: string, value: string) => void;
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
  updateSelectedPartStyle,
  resetSelectedPartStyle,
  onSelectNode,
  onAddStructuralChild,
  onRemoveStructuralChild,
  onMoveStructuralChild,
  onReorderStructuralChild,
  onDuplicateStructuralChild,
  usableAssets,
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

  const contentProperties = definition.propertiesSchema.filter(
    (property) => property.group === 'content',
  );

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
            );
            const hasOverride =
              resolved.authoredValue !== undefined && viewport !== 'desktop';
            return (
              <div className="builder-inspector-field-stack" key={field.key}>
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
                  value={resolved.effectiveValue ?? ''}
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
