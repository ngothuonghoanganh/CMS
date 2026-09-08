'use client';

import React, {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import {
  CSS_DIMENSION_UNITS,
  clampNumber,
  datetimeLocalFromIso,
  formatCssDimension,
  formatCssSpacing,
  isLinkedSpacing,
  isoFromDatetimeLocal,
  normalizeHexColor,
  parseCssDimension,
  parseCssSpacing,
  type CssDimensionUnit,
  type UnitSelection,
} from './field-utils';

type FieldProps = {
  children: ReactNode;
  className?: string | undefined;
  compact?: boolean | undefined;
  description?: string | undefined;
  error?: string | undefined;
  htmlFor?: string | undefined;
  label?: string | undefined;
  recommended?: boolean | undefined;
  required?: boolean | undefined;
};

export function FieldLabel({
  label,
  recommended = false,
  required = false,
}: {
  label: string;
  recommended?: boolean | undefined;
  required?: boolean | undefined;
}) {
  return (
    <span className="ui-field-label">
      {label}
      {required ? (
        <span aria-hidden="true" className="ui-field-required">
          {' '}
          *
        </span>
      ) : null}
      {recommended ? <span className="ui-field-recommended">Recommended</span> : null}
    </span>
  );
}

export function Field({
  children,
  className,
  compact = false,
  description,
  error,
  htmlFor,
  label,
  recommended = false,
  required = false,
}: FieldProps) {
  return (
    <div
      className={`ui-field${compact ? ' ui-field-compact' : ''}${className ? ` ${className}` : ''}`}
    >
      {label ? (
        <label htmlFor={htmlFor}>
          <FieldLabel label={label} recommended={recommended} required={required} />
        </label>
      ) : null}
      {children}
      {description ? <p className="ui-field-description">{description}</p> : null}
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field as FormField };

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> &
  Omit<FieldProps, 'children' | 'htmlFor'>;

export function TextField({
  className,
  compact,
  description,
  error,
  id,
  label,
  recommended,
  required,
  'aria-label': ariaLabel,
  type = 'text',
  ...inputProps
}: TextFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <input
        className="ui-control ui-text-field"
        id={inputId}
        required={required}
        type={type}
        {...inputProps}
        aria-label={ariaLabel ?? label}
      />
    </Field>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> &
  Omit<FieldProps, 'children' | 'htmlFor'>;

export function TextAreaField({
  className,
  compact,
  description,
  error,
  id,
  label,
  recommended,
  required,
  'aria-label': ariaLabel,
  ...textareaProps
}: TextAreaFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <textarea
        className="ui-control ui-textarea-field"
        id={inputId}
        required={required}
        {...textareaProps}
        aria-label={ariaLabel ?? label}
      />
    </Field>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> &
  Omit<FieldProps, 'children' | 'htmlFor'>;

export function SelectField({
  children,
  className,
  compact,
  description,
  error,
  id,
  label,
  recommended,
  required,
  'aria-label': ariaLabel,
  ...selectProps
}: SelectFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <select
        className="ui-control ui-select-field"
        id={inputId}
        required={required}
        {...selectProps}
        aria-label={ariaLabel ?? label}
      >
        {children}
      </select>
    </Field>
  );
}

export type ChoiceOption = { label: string; value: string };

export function CheckboxField({
  className,
  description,
  disabled,
  error,
  id,
  label,
  onChange,
  checked,
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> &
  Omit<FieldProps, 'children' | 'htmlFor'>) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <div className={`ui-choice-field${className ? ` ${className}` : ''}`}>
      <label className="ui-choice" htmlFor={inputId}>
        <input
          checked={checked}
          disabled={disabled}
          id={inputId}
          onChange={onChange}
          type="checkbox"
        />
        <span>{label}</span>
      </label>
      {description ? <p className="ui-field-description">{description}</p> : null}
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SwitchField({
  className,
  description,
  disabled,
  error,
  id,
  label,
  onChange,
  checked,
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> &
  Omit<FieldProps, 'children' | 'htmlFor'>) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <div className={`ui-choice-field${className ? ` ${className}` : ''}`}>
      <label className="ui-switch" htmlFor={inputId}>
        <input
          checked={checked}
          disabled={disabled}
          id={inputId}
          onChange={onChange}
          type="checkbox"
        />
        <span aria-hidden="true" className="ui-switch-track">
          <span className="ui-switch-thumb" />
        </span>
        <span>{label}</span>
      </label>
      {description ? <p className="ui-field-description">{description}</p> : null}
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RadioGroupField({
  className,
  description,
  disabled,
  error,
  label,
  name,
  onValueChange,
  options,
  value,
}: {
  className?: string | undefined;
  description?: string | undefined;
  disabled?: boolean | undefined;
  error?: string | undefined;
  label: string;
  name: string;
  onValueChange: (value: string) => void;
  options: readonly ChoiceOption[];
  value: string | undefined;
}) {
  return (
    <fieldset
      className={`ui-choice-field ui-radio-group${className ? ` ${className}` : ''}`}
    >
      <legend className="ui-field-label">{label}</legend>
      <div className="ui-radio-options">
        {options.map((option) => (
          <label className="ui-choice" key={option.value}>
            <input
              checked={value === option.value}
              disabled={disabled}
              name={name}
              onChange={() => onValueChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {description ? <p className="ui-field-description">{description}</p> : null}
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ComboboxField({
  className,
  description,
  error,
  id,
  label,
  options,
  'aria-label': ariaLabel,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'list'> &
  Omit<FieldProps, 'children' | 'htmlFor'> & { options: readonly ChoiceOption[] }) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const listId = `${inputId}-options`;
  return (
    <Field
      className={className}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
    >
      <input
        aria-label={ariaLabel ?? label}
        className="ui-control"
        id={inputId}
        list={listId}
        {...props}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} label={option.label} value={option.value} />
        ))}
      </datalist>
    </Field>
  );
}

export function MultiSelectField({
  children,
  className,
  compact,
  description,
  error,
  id,
  label,
  'aria-label': ariaLabel,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> &
  Omit<FieldProps, 'children' | 'htmlFor'>) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
    >
      <select
        className="ui-control ui-multi-select-field"
        id={inputId}
        multiple
        {...props}
        aria-label={ariaLabel ?? label}
      >
        {children}
      </select>
    </Field>
  );
}

type NumberControlProps = {
  ariaLabel: string;
  disabled?: boolean | undefined;
  draftValue?: string | undefined;
  id?: string | undefined;
  max?: number | undefined;
  min?: number | undefined;
  onDraftChange?: ((value: string) => void) | undefined;
  onDraftCommit?: ((value: string) => void) | undefined;
  onValueChange: (value: number | undefined) => void;
  step?: number | undefined;
  value: number | undefined;
};

function NumberControl({
  ariaLabel,
  disabled = false,
  draftValue,
  id,
  max,
  min,
  onDraftChange,
  onDraftCommit,
  onValueChange,
  step = 1,
  value,
}: NumberControlProps) {
  function update(raw: string) {
    if (onDraftChange) {
      onDraftChange(raw);
      return;
    }
    if (raw.trim() === '') {
      onValueChange(undefined);
      return;
    }
    const next = Number(raw);
    if (Number.isFinite(next)) onValueChange(clampNumber(next, min, max));
  }

  const displayedValue = draftValue ?? value ?? '';

  function stepValue(direction: -1 | 1) {
    const next = clampNumber((value ?? min ?? 0) + direction * step, min, max);
    onValueChange(next);
  }

  return (
    <div className="ui-number-control">
      <button
        aria-label="Decrease"
        className="ui-number-step"
        disabled={disabled || (min !== undefined && (value ?? min) <= min)}
        onClick={() => stepValue(-1)}
        type="button"
      >
        −
      </button>
      <input
        aria-label={ariaLabel}
        className="ui-control ui-number-input"
        disabled={disabled}
        id={id}
        inputMode="decimal"
        max={max}
        min={min}
        onBlur={() => onDraftCommit?.(String(displayedValue))}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onDraftCommit?.(String(event.currentTarget.value));
        }}
        step={step}
        type="number"
        value={displayedValue}
      />
      <button
        aria-label="Increase"
        className="ui-number-step"
        disabled={disabled || (max !== undefined && (value ?? max) >= max)}
        onClick={() => stepValue(1)}
        type="button"
      >
        +
      </button>
    </div>
  );
}

export type NumberFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  disabled?: boolean | undefined;
  draftValue?: string | undefined;
  id?: string | undefined;
  max?: number | undefined;
  min?: number | undefined;
  onDraftChange?: ((value: string) => void) | undefined;
  onDraftCommit?: ((value: string) => void) | undefined;
  onValueChange: (value: number | undefined) => void;
  step?: number | undefined;
  suffix?: string | undefined;
  value: number | undefined;
};

export function NumberField({
  className,
  compact,
  description,
  disabled,
  draftValue,
  error,
  id,
  label,
  recommended,
  required,
  max,
  min,
  onDraftChange,
  onDraftCommit,
  onValueChange,
  step,
  suffix,
  value,
}: NumberFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <div className="ui-number-field-row">
        <NumberControl
          ariaLabel={label ?? 'Number value'}
          disabled={disabled}
          draftValue={draftValue}
          id={inputId}
          max={max}
          min={min}
          onDraftChange={onDraftChange}
          onDraftCommit={onDraftCommit}
          onValueChange={onValueChange}
          step={step}
          value={value}
        />
        {suffix ? <span className="ui-field-suffix">{suffix}</span> : null}
      </div>
    </Field>
  );
}

export type UnitFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  allowAuto?: boolean | undefined;
  disabled?: boolean | undefined;
  draftValue?: string | undefined;
  id?: string | undefined;
  max?: number | undefined;
  min?: number | undefined;
  onDraftChange?: ((value: string) => void) | undefined;
  onDraftCommit?: ((value: string) => void) | undefined;
  onValueChange: (value: string) => void;
  step?: number | undefined;
  units?: readonly CssDimensionUnit[] | undefined;
  value: string | undefined;
};

export function UnitField({
  allowAuto = false,
  className,
  compact,
  description,
  disabled,
  draftValue,
  error,
  id,
  label,
  recommended,
  required,
  max,
  min,
  onDraftChange,
  onDraftCommit,
  onValueChange,
  step,
  units = CSS_DIMENSION_UNITS,
  value,
}: UnitFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const parsed = parseCssDimension(value);
  const selectedUnit: UnitSelection =
    parsed.unit === 'auto' && !allowAuto ? 'px' : parsed.unit;
  const [draftRaw, setDraftRaw] = useState<string | undefined>(undefined);

  useEffect(() => setDraftRaw(undefined), [value]);

  function update(nextValue: number | undefined, nextUnit = selectedUnit) {
    onValueChange(formatCssDimension(nextValue, nextUnit));
  }

  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <div className="ui-unit-control">
        <NumberControl
          ariaLabel={label ?? 'Dimension'}
          disabled={disabled || selectedUnit === 'auto'}
          draftValue={
            draftRaw ??
            (draftValue ? parseCssDimension(draftValue).value?.toString() : undefined)
          }
          id={inputId}
          max={max}
          min={min}
          onDraftChange={(raw) => {
            setDraftRaw(raw);
            onDraftChange?.(raw);
            const numeric = Number(raw);
            if (
              raw.trim() !== '' &&
              Number.isFinite(numeric) &&
              (min === undefined || numeric >= min) &&
              (max === undefined || numeric <= max)
            ) {
              setDraftRaw(undefined);
              update(numeric);
            }
          }}
          onDraftCommit={(raw) => {
            const next =
              raw.trim() === ''
                ? ''
                : Number.isFinite(Number(raw))
                  ? formatCssDimension(Number(raw), selectedUnit)
                  : raw;
            onDraftCommit?.(next);
            if (!onDraftCommit) {
              if (next === '') update(undefined);
              else if (next !== raw || Number.isFinite(Number(raw))) update(Number(raw));
            }
          }}
          onValueChange={(nextValue) => {
            setDraftRaw(undefined);
            update(nextValue);
          }}
          step={step}
          value={parsed.value}
        />
        <select
          aria-label="Unit"
          className="ui-control ui-unit-select"
          disabled={disabled}
          id={`${inputId}-unit`}
          onChange={(event) => {
            setDraftRaw(undefined);
            update(parsed.value, event.target.value as UnitSelection);
          }}
          value={selectedUnit}
        >
          {allowAuto ? <option value="auto">Auto</option> : null}
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </div>
      {parsed.unsupported ? (
        <p className="ui-field-description">
          Existing custom value “{parsed.unsupported}” is preserved until this control is
          changed.
        </p>
      ) : null}
    </Field>
  );
}

export type ColorFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  disabled?: boolean | undefined;
  id?: string | undefined;
  onValueChange: (value: string) => void;
  onDraftChange?: ((value: string) => void) | undefined;
  onDraftCommit?: ((value: string) => void) | undefined;
  value: string | undefined;
};

export function ColorField({
  className,
  compact,
  description,
  disabled,
  error,
  id,
  label,
  recommended,
  required,
  onDraftChange,
  onDraftCommit,
  onValueChange,
  value,
}: ColorFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [draft, setDraft] = useState(value ?? '');
  const hexValue = normalizeHexColor(value) ?? '#000000';

  useEffect(() => setDraft(value ?? ''), [value]);

  function commit(raw: string) {
    const normalized = normalizeHexColor(raw);
    if (normalized || raw.trim() === '') onValueChange(raw.trim());
  }

  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <div className="ui-color-control">
        <input
          aria-label={`${label ?? 'Color'} picker`}
          className="ui-color-swatch"
          disabled={disabled}
          id={inputId}
          onChange={(event) => {
            setDraft(event.target.value.toUpperCase());
            commit(event.target.value);
          }}
          type="color"
          value={hexValue}
        />
        <input
          aria-label={`${label ?? 'Color'} hex value`}
          className="ui-control ui-color-value"
          disabled={disabled}
          maxLength={7}
          onBlur={(event) => {
            commit(event.target.value);
            onDraftCommit?.(event.target.value);
            if (
              !normalizeHexColor(event.target.value) &&
              event.target.value.trim() !== ''
            ) {
              setDraft(value ?? '');
            }
          }}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            onDraftChange?.(next);
            if (normalizeHexColor(next)) commit(next);
          }}
          placeholder="#000000"
          spellCheck={false}
          value={draft}
        />
        <button
          aria-label={`Clear ${label ?? 'color'}`}
          className="ui-control-action"
          disabled={disabled || value === '' || value === undefined}
          onClick={() => {
            setDraft('');
            onValueChange('');
          }}
          type="button"
        >
          Clear
        </button>
      </div>
    </Field>
  );
}

export type DateTimeFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  disabled?: boolean | undefined;
  id?: string | undefined;
  onValueChange: (value: string | undefined) => void;
  value: string | undefined;
};

export function DateTimeField({
  className,
  compact,
  description,
  disabled,
  error,
  id,
  label,
  recommended,
  required,
  onValueChange,
  value,
}: DateTimeFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <input
        className="ui-control ui-datetime-field"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onValueChange(isoFromDatetimeLocal(event.target.value))}
        type="datetime-local"
        value={datetimeLocalFromIso(value)}
      />
    </Field>
  );
}

export function DateField({
  className,
  compact,
  description,
  disabled,
  error,
  id,
  label,
  recommended,
  required,
  onValueChange,
  value,
}: Omit<FieldProps, 'children' | 'htmlFor'> & {
  disabled?: boolean | undefined;
  id?: string | undefined;
  onValueChange: (value: string | undefined) => void;
  value: string | undefined;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <input
        className="ui-control ui-date-field"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onValueChange(event.target.value || undefined)}
        type="date"
        value={value ?? ''}
      />
    </Field>
  );
}

export function TimeField({
  className,
  compact,
  description,
  disabled,
  error,
  id,
  label,
  recommended,
  required,
  onValueChange,
  value,
}: Omit<FieldProps, 'children' | 'htmlFor'> & {
  disabled?: boolean | undefined;
  id?: string | undefined;
  onValueChange: (value: string | undefined) => void;
  value: string | undefined;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <input
        className="ui-control ui-time-field"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onValueChange(event.target.value || undefined)}
        type="time"
        value={value ?? ''}
      />
    </Field>
  );
}

export type SegmentedOption<T extends string> = { label: string; value: T };

export function SegmentedControl<T extends string>({
  ariaLabel,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  value: T | undefined;
}) {
  return (
    <div aria-label={ariaLabel} className="ui-segmented-control" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={option.value === value ? 'is-selected' : undefined}
          key={option.value}
          onClick={() => onValueChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type LayoutSelection = {
  display: string;
  flexDirection?: 'row' | 'column' | undefined;
};

export type LayoutFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  direction?: string | undefined;
  id?: string | undefined;
  onValueChange: (value: LayoutSelection) => void;
  supportsDirection?: boolean | undefined;
  value: string | undefined;
};

function layoutMode(display: string, direction: string | undefined): string {
  if (display === 'flex') return direction === 'column' ? 'stack' : 'row';
  if (display === 'grid') return 'grid';
  if (display === 'block') return 'block';
  if (display === 'inline') return 'inline';
  if (display === 'inline-block') return 'inline-block';
  if (display === 'none') return 'none';
  return 'auto';
}

export function LayoutField({
  className,
  compact,
  description,
  direction,
  error,
  id,
  label,
  onValueChange,
  recommended,
  required,
  supportsDirection = true,
  value,
}: LayoutFieldProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      htmlFor={inputId}
      label={label}
      recommended={recommended}
      required={required}
    >
      <select
        className="ui-control ui-select-field"
        id={inputId}
        onChange={(event) => {
          const mode = event.target.value;
          if (mode === 'stack' || mode === 'row') {
            onValueChange({
              display: 'flex',
              ...(supportsDirection
                ? { flexDirection: mode === 'stack' ? 'column' : 'row' }
                : {}),
            });
          } else if (mode === 'grid') {
            onValueChange({ display: 'grid' });
          } else if (mode === 'auto') {
            onValueChange({ display: '' });
          } else {
            onValueChange({ display: mode });
          }
        }}
        required={required}
        value={layoutMode(value ?? '', direction)}
      >
        <option value="auto">Auto</option>
        {supportsDirection ? <option value="stack">Stack</option> : null}
        <option value="row">Row</option>
        <option value="grid">Grid</option>
        <option value="block">Block</option>
        <option value="inline">Inline</option>
        <option value="inline-block">Inline block</option>
        <option value="none">Hidden</option>
      </select>
    </Field>
  );
}

export type LinkDestinationKind =
  'page' | 'section' | 'external' | 'phone' | 'email' | 'none';

export type LinkPageOption = {
  id: string;
  name: string;
  path?: string | undefined;
  anchors?: readonly string[] | undefined;
};

export type LinkFieldProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  allowEmpty?: boolean | undefined;
  onCommit: (value: string) => void;
  onInvalid?: ((value: string) => void) | undefined;
  pages?: readonly LinkPageOption[];
  value: string | undefined;
};

function linkDestinationKind(value: string): LinkDestinationKind {
  if (value.startsWith('#')) return 'section';
  if (/^mailto:/i.test(value)) return 'email';
  if (/^tel:/i.test(value)) return 'phone';
  if (/^https?:\/\//i.test(value)) return 'external';
  return 'page';
}

/** A semantic link editor that still commits the existing href contract. */
export function LinkField({
  allowEmpty = false,
  compact,
  description,
  error,
  label,
  onCommit,
  onInvalid,
  pages = [],
  recommended,
  required,
  value,
}: LinkFieldProps) {
  const [kind, setKind] = useState<LinkDestinationKind>(() =>
    allowEmpty && !(value ?? '').trim() ? 'none' : linkDestinationKind(value ?? ''),
  );
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => {
    setDraft(value ?? '');
    setKind(
      allowEmpty && !(value ?? '').trim() ? 'none' : linkDestinationKind(value ?? ''),
    );
  }, [allowEmpty, value]);

  const selectedPage = pages.find((page) => (page.path || '/') === draft);
  const sections = pages.flatMap((page) =>
    (page.anchors ?? []).map((anchor) => ({
      label: `${page.name} — ${anchor}`,
      value: `${page.path || '/'}#${anchor}`,
    })),
  );
  const commitDraft = (next: string) => {
    setDraft(next);
    onCommit(next);
  };

  return (
    <Field
      compact={compact}
      description={description}
      error={error}
      label={label}
      recommended={recommended}
      required={required}
    >
      <div className="ui-link-field">
        <select
          aria-label={`${label ?? 'Link'} destination type`}
          className="ui-control ui-select-field"
          onChange={(event) => {
            const nextKind = event.target.value as LinkDestinationKind;
            setKind(nextKind);
            if (nextKind === 'page') {
              const next = pages[0]?.path || '/';
              commitDraft(next);
            } else if (nextKind === 'section') {
              const next = sections[0]?.value ?? '#section';
              commitDraft(next);
            } else if (nextKind === 'email') {
              setDraft('');
            } else if (nextKind === 'phone') {
              setDraft('');
            } else if (nextKind === 'none') {
              commitDraft('');
            } else {
              setDraft('');
            }
          }}
          value={kind}
        >
          <option value="page">Page</option>
          <option value="section">Section</option>
          <option value="external">External website</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
          {allowEmpty ? <option value="none">No link</option> : null}
        </select>
        {kind === 'page' ? (
          <select
            aria-label={`${label ?? 'Link'} page`}
            className="ui-control ui-select-field"
            onChange={(event) => commitDraft(event.target.value)}
            value={selectedPage ? draft : ''}
          >
            {!pages.length ? <option value="">No pages available</option> : null}
            {pages.map((page) => (
              <option key={page.id} value={page.path || '/'}>
                {page.name}
              </option>
            ))}
          </select>
        ) : null}
        {kind === 'section' ? (
          <select
            aria-label={`${label ?? 'Link'} section`}
            className="ui-control ui-select-field"
            onChange={(event) => commitDraft(event.target.value)}
            value={sections.some((section) => section.value === draft) ? draft : ''}
          >
            {!sections.length ? <option value="#section">Choose a section</option> : null}
            {sections.map((section) => (
              <option key={section.value} value={section.value}>
                {section.label}
              </option>
            ))}
          </select>
        ) : null}
        {kind === 'external' ? (
          <input
            aria-label={`${label ?? 'Link'} website`}
            className="ui-control ui-text-field"
            onBlur={() => onCommit(draft)}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="example.com"
            type="text"
            value={draft}
          />
        ) : null}
        {kind === 'phone' || kind === 'email' ? (
          <input
            aria-label={`${label ?? 'Link'} ${kind}`}
            className="ui-control ui-text-field"
            onBlur={() => {
              const prefix = kind === 'email' ? 'mailto:' : 'tel:';
              const raw = draft.replace(new RegExp(`^${prefix}`, 'i'), '');
              const next = `${prefix}${raw}`;
              if (raw.trim()) onCommit(next);
              else onInvalid?.(next);
            }}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={kind === 'email' ? 'you@example.com' : '+1 555 0100'}
            type={kind === 'email' ? 'email' : 'tel'}
            value={draft.replace(new RegExp(`^(mailto:|tel:)`, 'i'), '')}
          />
        ) : null}
        {kind === 'none' ? (
          <p className="ui-field-description">This item will not link anywhere.</p>
        ) : null}
      </div>
    </Field>
  );
}

export type SpacingControlProps = Omit<FieldProps, 'children' | 'htmlFor'> & {
  allowAuto?: boolean | undefined;
  disabled?: boolean | undefined;
  onValueChange: (value: string) => void;
  value: string | undefined;
};

export function SpacingControl({
  allowAuto = false,
  className,
  compact,
  description,
  disabled,
  error,
  label,
  onValueChange,
  value,
}: SpacingControlProps) {
  const sides = parseCssSpacing(value);
  const [linked, setLinked] = useState(() => isLinkedSpacing(sides));

  useEffect(() => setLinked(isLinkedSpacing(parseCssSpacing(value))), [value]);

  function updateSide(side: keyof typeof sides, next: string) {
    const nextSides = linked
      ? { top: next, right: next, bottom: next, left: next }
      : { ...sides, [side]: next };
    onValueChange(formatCssSpacing(nextSides));
  }

  return (
    <Field
      className={className}
      compact={compact}
      description={description}
      error={error}
      label={label}
    >
      <div className="ui-spacing-header">
        <span className="ui-field-description">Box model</span>
        <button
          aria-pressed={linked}
          className="ui-link-toggle"
          disabled={disabled}
          onClick={() => {
            if (!linked)
              onValueChange(
                formatCssSpacing({
                  top: sides.top,
                  right: sides.top,
                  bottom: sides.top,
                  left: sides.top,
                }),
              );
            setLinked((current) => !current);
          }}
          type="button"
        >
          {linked ? 'Linked' : 'Unlinked'}
        </button>
      </div>
      <div className="ui-spacing-box" data-spacing-linked={linked}>
        <span className="ui-spacing-box-caption">{label ?? 'Spacing'}</span>
        <div className="ui-spacing-control">
          {(linked
            ? ([['all', 'All', sides.top]] as const)
            : ([
                ['top', 'Top', sides.top],
                ['right', 'Right', sides.right],
                ['bottom', 'Bottom', sides.bottom],
                ['left', 'Left', sides.left],
              ] as const)
          ).map(([side, sideLabel, sideValue]) => (
            <UnitField
              allowAuto={allowAuto}
              compact
              disabled={disabled}
              key={side}
              label={sideLabel}
              onValueChange={(next) => updateSide(side === 'all' ? 'top' : side, next)}
              value={sideValue}
            />
          ))}
        </div>
      </div>
    </Field>
  );
}

export const Input = TextField;
export const Textarea = TextAreaField;
export const NumberInput = NumberField;
export const Select = SelectField;
export const Combobox = ComboboxField;
export const MultiSelect = MultiSelectField;
export const DatePicker = DateField;
export const TimePicker = TimeField;
export const ColorPicker = ColorField;
