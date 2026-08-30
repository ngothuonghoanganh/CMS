'use client';

import type { Asset, ComponentPropertyDefinition } from '@payload/contracts';
import type { ReactNode } from 'react';
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

export type PropertyControlRendererProps = {
  definition: ComponentPropertyDefinition;
  value: unknown;
  description?: string | undefined;
  assets?: readonly Asset[];
  assetKind?: 'image' | 'video' | undefined;
  onChange: (value: unknown) => void;
  onReset?: (() => void) | undefined;
};

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function FieldShell({
  children,
  onReset,
  label,
}: {
  children: ReactNode;
  onReset?: (() => void) | undefined;
  label: string;
}) {
  return (
    <div className="builder-inspector-field-stack">
      {children}
      {onReset ? (
        <button
          aria-label={`Reset ${label} override`}
          className="button button-small button-ghost builder-reset-override"
          onClick={onReset}
          type="button"
        >
          Reset override
        </button>
      ) : null}
    </div>
  );
}

export function PropertyControlRenderer({
  definition,
  value,
  description,
  assets = [],
  assetKind,
  onChange,
  onReset,
}: PropertyControlRendererProps) {
  const string = textValue(value);
  const common = { compact: true, description, label: definition.label } as const;

  if (definition.control === 'custom') return null;
  if (definition.control === 'textarea') {
    return (
      <TextAreaField
        {...common}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        value={string}
      />
    );
  }
  if (definition.control === 'text' || definition.control === 'url') {
    return (
      <TextField
        {...common}
        onChange={(event) => onChange(event.target.value)}
        type={definition.control === 'url' ? 'url' : 'text'}
        value={string}
      />
    );
  }
  if (definition.control === 'datetime') {
    return (
      <DateTimeField
        {...common}
        onValueChange={(nextValue) => onChange(nextValue)}
        value={string}
      />
    );
  }
  if (definition.control === 'number') {
    const number = string === '' ? undefined : Number(string);
    return (
      <NumberField
        {...common}
        max={definition.max}
        min={definition.min}
        onValueChange={(next) => onChange(next)}
        step={definition.step}
        value={number !== undefined && Number.isFinite(number) ? number : undefined}
      />
    );
  }
  if (definition.control === 'unit') {
    return (
      <UnitField
        {...common}
        allowAuto={definition.allowAuto}
        onValueChange={onChange as (value: string) => void}
        value={string}
      />
    );
  }
  if (definition.control === 'spacing') {
    return (
      <SpacingControl
        {...common}
        allowAuto={definition.allowAuto}
        onValueChange={onChange as (value: string) => void}
        value={string}
      />
    );
  }
  if (definition.control === 'color') {
    return (
      <ColorField
        {...common}
        onValueChange={onChange as (value: string) => void}
        value={string}
      />
    );
  }
  if (definition.control === 'segmented') {
    const options = (definition.options ?? []) as readonly SegmentedOption<string>[];
    return (
      <div className="ui-field ui-field-compact">
        <span className="ui-field-label">{definition.label}</span>
        {description ? <p className="ui-field-description">{description}</p> : null}
        <SegmentedControl
          ariaLabel={definition.label}
          onValueChange={onChange}
          options={options}
          value={string}
        />
      </div>
    );
  }
  if (definition.control === 'toggle') {
    return (
      <label className="checkbox-field">
        <input
          aria-label={definition.label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        {definition.label}
        {description ? <span className="ui-field-description">{description}</span> : null}
      </label>
    );
  }
  if (definition.control === 'asset') {
    const available = assets.filter((asset) =>
      assetKind === 'video'
        ? asset.mimeType.toLowerCase().startsWith('video/')
        : asset.mimeType.toLowerCase().startsWith('image/'),
    );
    return (
      <FieldShell label={definition.label} onReset={onReset}>
        <SelectField
          {...common}
          onChange={(event) => onChange(event.target.value)}
          value={string}
        >
          <option value="">Select a workspace asset</option>
          {available.map((asset) => (
            <option key={asset.id} value={asset.storageKey}>
              {asset.filename}
            </option>
          ))}
        </SelectField>
        <TextField
          compact
          description="Or use a direct http(s) URL."
          label={`${definition.label} URL`}
          onChange={(event) => onChange(event.target.value)}
          type="url"
          value={string}
        />
      </FieldShell>
    );
  }
  return (
    <FieldShell label={definition.label} onReset={onReset}>
      <SelectField
        {...common}
        onChange={(event) => onChange(event.target.value)}
        value={string}
      >
        {definition.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    </FieldShell>
  );
}
