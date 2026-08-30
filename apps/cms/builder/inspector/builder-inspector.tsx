'use client';

import {
  PAGE_COMPONENT_REGISTRY,
  PAGE_STYLE_PROPERTY_GROUPS,
  type Asset,
  type ComponentPropertyDefinition,
  type FormField,
  type FormProps,
} from '@payload/contracts';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ColorField,
  DateTimeField,
  NumberField,
  SegmentedControl,
  SelectField,
  SpacingControl,
  TextAreaField,
  TextField,
  UnitField,
  type SegmentedOption,
} from '../../app/ui/fields';
import type { BuilderViewport } from '../builder-adapter';
import type { SelectedBuilderNode } from '../grapes-editor';
import { resolveInspectorStyleValue } from './inspector-value';

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
  updateSelectedText: (value: string) => void;
  updateSelectedAttribute: (
    name: 'href' | 'target' | 'src' | 'alt',
    value: string,
  ) => void;
  updateSelectedStyle: (property: string, value: string) => void;
  resetSelectedStyle: (property: string) => void;
  updateForm: (form: FormProps) => void;
  updateSelectedCountdown: (key: 'label' | 'targetAt', value: string) => void;
  patchFormField: (index: number, patch: Record<string, unknown>) => void;
  addFormField: () => void;
  moveFormField: (index: number, direction: -1 | 1) => void;
  removeFormField: (index: number) => void;
  changeFormFieldType: (index: number, type: FormField['type']) => void;
  usableAssets: Asset[];
};

const alignmentOptions: readonly SegmentedOption<'left' | 'center' | 'right'>[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const imageSourceOptions: readonly SegmentedOption<'asset' | 'url'>[] = [
  { value: 'asset', label: 'Workspace asset' },
  { value: 'url', label: 'Direct URL' },
];

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

export function BuilderInspector({
  selected,
  viewport,
  inspectorTab,
  onInspectorTabChange,
  openSections,
  onToggleSection,
  updateSelectedText,
  updateSelectedAttribute,
  updateSelectedStyle,
  resetSelectedStyle,
  updateForm,
  updateSelectedCountdown,
  patchFormField,
  addFormField,
  moveFormField,
  removeFormField,
  changeFormFieldType,
  usableAssets,
}: BuilderInspectorProps) {
  const [imageSourceMode, setImageSourceMode] = useState<'asset' | 'url'>(() =>
    usableAssets.some((asset) => asset.storageKey === selected.src) ? 'asset' : 'url',
  );

  useEffect(() => {
    setImageSourceMode(
      usableAssets.some((asset) => asset.storageKey === selected.src) ? 'asset' : 'url',
    );
  }, [selected.id, selected.src, usableAssets]);

  function renderStyleSection(section: InspectorStyleSection) {
    const allowedPropertyKeys = new Set(
      PAGE_COMPONENT_REGISTRY[selected.type].propertiesSchema
        .filter((property) => property.group === 'style')
        .map((property) => property.key),
    );
    const fields = section.fields.filter((field) => allowedPropertyKeys.has(field.key));
    if (fields.length === 0) return null;

    return (
      <InspectorSection
        key={section.key}
        label={section.label}
        onToggle={(open) => onToggleSection(section.key, open)}
        open={openSections[section.key]}
      >
        <div className="builder-inspector-fields">
          {fields.map((option) => {
            const resolved = resolveInspectorStyleValue(
              selected.style,
              option.key,
              viewport,
            );
            const value = resolved.effectiveValue ?? '';
            const description =
              resolved.inherited && resolved.sourceViewport
                ? `Inherited from ${resolved.sourceViewport.charAt(0).toUpperCase()}${resolved.sourceViewport.slice(1)}`
                : option.description;
            const hasOverride =
              resolved.authoredValue !== undefined && viewport !== 'desktop';
            const resetOverride = hasOverride ? (
              <button
                aria-label={`Reset ${option.label} override`}
                className="button button-small button-ghost builder-reset-override"
                onClick={() => resetSelectedStyle(option.key)}
                type="button"
              >
                Reset override
              </button>
            ) : null;
            if (option.control === 'unit') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <UnitField
                    allowAuto={option.allowAuto}
                    compact
                    description={description}
                    label={option.label}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(option.key, nextValue)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'number') {
              const numericValue = value === '' ? undefined : Number(value);
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <NumberField
                    compact
                    description={description}
                    label={option.label}
                    max={option.max}
                    min={option.min}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(
                        option.key,
                        nextValue === undefined ? '' : String(nextValue),
                      )
                    }
                    step={option.step}
                    value={
                      numericValue !== undefined && Number.isFinite(numericValue)
                        ? numericValue
                        : undefined
                    }
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'spacing') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <SpacingControl
                    allowAuto={option.allowAuto}
                    compact
                    description={description}
                    label={option.label}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(option.key, nextValue)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'color') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <ColorField
                    compact
                    description={description}
                    label={option.label}
                    onValueChange={(nextValue) =>
                      updateSelectedStyle(option.key, nextValue)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'segmented') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <div className="ui-field ui-field-compact">
                    <span className="ui-field-label">{option.label}</span>
                    {description ? (
                      <p className="ui-field-description">{description}</p>
                    ) : null}
                    <SegmentedControl
                      ariaLabel={option.label}
                      onValueChange={(nextValue) =>
                        updateSelectedStyle(option.key, nextValue)
                      }
                      options={option.options ?? alignmentOptions}
                      value={value}
                    />
                  </div>
                  {resetOverride}
                </div>
              );
            }
            if (option.control === 'text') {
              return (
                <div className="builder-inspector-field-stack" key={option.key}>
                  <TextField
                    compact
                    description={description ?? option.description}
                    label={option.label}
                    onChange={(event) =>
                      updateSelectedStyle(option.key, event.target.value)
                    }
                    value={value}
                  />
                  {resetOverride}
                </div>
              );
            }
            return (
              <div className="builder-inspector-field-stack" key={option.key}>
                <SelectField
                  compact
                  description={description}
                  label={option.label}
                  onChange={(event) =>
                    updateSelectedStyle(option.key, event.target.value)
                  }
                  value={value}
                >
                  {option.options?.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </SelectField>
                {resetOverride}
              </div>
            );
          })}
        </div>
      </InspectorSection>
    );
  }

  function renderContentInspector() {
    if (selected.type === 'form' || selected.type === 'countdown') return null;
    const fields = PAGE_COMPONENT_REGISTRY[selected.type].propertiesSchema.filter(
      (property) => property.group === 'content',
    );
    if (fields.length === 0) return null;

    return (
      <InspectorSection
        label="Content"
        onToggle={(open) => onToggleSection('content', open)}
        open={openSections.content}
      >
        <div className="builder-inspector-fields">
          {fields.map((property) => {
            if (selected.type === 'text' && property.key === 'text') {
              return (
                <TextAreaField
                  aria-label="Text content"
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) => updateSelectedText(event.target.value)}
                  rows={5}
                  value={selected.text ?? ''}
                />
              );
            }
            if (selected.type === 'button' && property.key === 'label') {
              return (
                <TextField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) => updateSelectedText(event.target.value)}
                  value={selected.label ?? ''}
                />
              );
            }
            if (selected.type === 'button' && property.key === 'href') {
              return (
                <TextField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) =>
                    updateSelectedAttribute('href', event.target.value)
                  }
                  type="url"
                  value={selected.href ?? ''}
                />
              );
            }
            if (selected.type === 'button' && property.key === 'target') {
              return (
                <SelectField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) =>
                    updateSelectedAttribute('target', event.target.value)
                  }
                  value={selected.target ?? '_self'}
                >
                  {property.options?.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </SelectField>
              );
            }
            if (selected.type === 'image' && property.key === 'src') {
              return (
                <div className="builder-inspector-field-stack" key={property.key}>
                  <div className="ui-field ui-field-compact">
                    <span className="ui-field-label">Source</span>
                    <SegmentedControl
                      ariaLabel="Image source"
                      onValueChange={setImageSourceMode}
                      options={imageSourceOptions}
                      value={imageSourceMode}
                    />
                  </div>
                  {imageSourceMode === 'asset' ? (
                    <SelectField
                      compact
                      description={property.description}
                      label="Workspace asset"
                      onChange={(event) =>
                        updateSelectedAttribute('src', event.target.value)
                      }
                      value={selected.src ?? ''}
                    >
                      <option value="">Select an asset</option>
                      {usableAssets.map((asset) => (
                        <option key={asset.id} value={asset.storageKey}>
                          {asset.filename}
                        </option>
                      ))}
                    </SelectField>
                  ) : (
                    <TextField
                      compact
                      description="Use a direct URL only when the asset is not in this workspace."
                      label="Image URL"
                      onChange={(event) =>
                        updateSelectedAttribute('src', event.target.value)
                      }
                      type="url"
                      value={selected.src ?? ''}
                    />
                  )}
                </div>
              );
            }
            if (selected.type === 'image' && property.key === 'alt') {
              return (
                <TextField
                  compact
                  description={property.description}
                  key={property.key}
                  label={property.label}
                  onChange={(event) => updateSelectedAttribute('alt', event.target.value)}
                  value={selected.alt ?? ''}
                />
              );
            }
            return null;
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

      {inspectorTab === 'content' ? (
        <>
          {selected.type === 'form' && selected.form ? (
            <InspectorSection
              label="Form"
              onToggle={(open) => onToggleSection('content', open)}
              open={openSections.content}
            >
              <div className="builder-inspector-fields">
                <label>
                  Submit button label
                  <input
                    aria-label="Submit button label"
                    onChange={(event) =>
                      updateForm({
                        ...selected.form!,
                        submitLabel: event.target.value,
                      })
                    }
                    value={selected.form.submitLabel}
                  />
                </label>
                <label>
                  Success message
                  <textarea
                    aria-label="Form success message"
                    onChange={(event) =>
                      updateForm({
                        ...selected.form!,
                        successMessage: event.target.value,
                      })
                    }
                    rows={3}
                    value={selected.form.successMessage}
                  />
                </label>
                <div className="builder-form-fields">
                  <div className="builder-property-control">
                    <span className="builder-property-label">Fields</span>
                    <button
                      className="button button-secondary button-small"
                      disabled={selected.form.fields.length >= 20}
                      onClick={addFormField}
                      type="button"
                    >
                      + Add field
                    </button>
                  </div>
                  {selected.form.fields.map((field, index) => (
                    <fieldset className="builder-form-field" key={field.id}>
                      <legend>
                        {index + 1}. {field.label}
                      </legend>
                      <label>
                        Label
                        <input
                          aria-label={`Form field label ${field.id}`}
                          onChange={(event) =>
                            patchFormField(index, { label: event.target.value })
                          }
                          value={field.label}
                        />
                      </label>
                      <label>
                        Type
                        <select
                          aria-label={`Form field type ${field.id}`}
                          onChange={(event) =>
                            changeFormFieldType(
                              index,
                              event.target.value as FormField['type'],
                            )
                          }
                          value={field.type}
                        >
                          <option value="text">Text</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                          <option value="textarea">Textarea</option>
                          <option value="select">Select</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="radio">Radio</option>
                        </select>
                      </label>
                      {'placeholder' in field ? (
                        <label>
                          Placeholder
                          <input
                            aria-label={`Form field placeholder ${field.id}`}
                            onChange={(event) =>
                              patchFormField(index, { placeholder: event.target.value })
                            }
                            value={field.placeholder ?? ''}
                          />
                        </label>
                      ) : null}
                      <label className="checkbox-field">
                        <input
                          aria-label={`Form field required ${field.id}`}
                          checked={field.required}
                          onChange={(event) =>
                            patchFormField(index, { required: event.target.checked })
                          }
                          type="checkbox"
                        />
                        Required
                      </label>
                      {'options' in field ? (
                        <div className="builder-form-options">
                          {field.options.map((option, optionIndex) => (
                            <label key={`${field.id}-${optionIndex}`}>
                              Option {optionIndex + 1}
                              <input
                                aria-label={`Form option ${field.id} ${optionIndex + 1}`}
                                onChange={(event) => {
                                  const options = field.options.map(
                                    (current, currentIndex) =>
                                      currentIndex === optionIndex
                                        ? { ...current, label: event.target.value }
                                        : current,
                                  );
                                  patchFormField(index, { options });
                                }}
                                value={option.label}
                              />
                            </label>
                          ))}
                        </div>
                      ) : null}
                      <div className="row-actions">
                        <button
                          className="button button-ghost button-small"
                          disabled={index === 0}
                          onClick={() => moveFormField(index, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          className="button button-ghost button-small"
                          disabled={index === selected.form!.fields.length - 1}
                          onClick={() => moveFormField(index, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                        <button
                          className="button button-danger button-small"
                          disabled={selected.form!.fields.length <= 1}
                          onClick={() => removeFormField(index)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
            </InspectorSection>
          ) : null}
          {selected.type === 'countdown' && selected.countdown ? (
            <InspectorSection
              label="Countdown"
              onToggle={(open) => onToggleSection('content', open)}
              open={openSections.content}
            >
              <div className="builder-inspector-fields">
                <TextField
                  compact
                  label="Countdown label"
                  onChange={(event) =>
                    updateSelectedCountdown('label', event.target.value)
                  }
                  value={selected.countdown.label}
                />
                <DateTimeField
                  compact
                  description="Stored as UTC in the existing countdown payload."
                  label="Target date and time"
                  onValueChange={(nextValue) => {
                    if (nextValue) updateSelectedCountdown('targetAt', nextValue);
                  }}
                  value={selected.countdown.targetAt}
                />
              </div>
            </InspectorSection>
          ) : null}
          {renderContentInspector()}
        </>
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
              {selected.type === 'root'
                ? 'This is the page root.'
                : 'Selection actions are available from the canvas toolbar, Layers, and keyboard shortcuts.'}
            </p>
          </InspectorSection>
          <InspectorSection
            label="Accessibility"
            onToggle={(open) => onToggleSection('background', open)}
            open={openSections.background}
          >
            <p className="muted small">
              Content labels and alternative text are edited in the Content tab.
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
