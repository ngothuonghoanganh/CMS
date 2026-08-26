'use client';

import {
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
};

export function Field({
  children,
  className,
  compact = false,
  description,
  error,
  htmlFor,
  label,
}: FieldProps) {
  return (
    <div
      className={`ui-field${compact ? ' ui-field-compact' : ''}${className ? ` ${className}` : ''}`}
    >
      {label ? (
        <label className="ui-field-label" htmlFor={htmlFor}>
          {label}
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

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> &
  Omit<FieldProps, 'children' | 'htmlFor'>;

export function TextField({
  className,
  compact,
  description,
  error,
  id,
  label,
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
    >
      <input
        className="ui-control ui-text-field"
        id={inputId}
        type={type}
        {...inputProps}
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
    >
      <textarea
        className="ui-control ui-textarea-field"
        id={inputId}
        {...textareaProps}
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
    >
      <select className="ui-control ui-select-field" id={inputId} {...selectProps}>
        {children}
      </select>
    </Field>
  );
}

type NumberControlProps = {
  ariaLabel: string;
  disabled?: boolean | undefined;
  id?: string | undefined;
  max?: number | undefined;
  min?: number | undefined;
  onValueChange: (value: number | undefined) => void;
  step?: number | undefined;
  value: number | undefined;
};

function NumberControl({
  ariaLabel,
  disabled = false,
  id,
  max,
  min,
  onValueChange,
  step = 1,
  value,
}: NumberControlProps) {
  function update(raw: string) {
    if (raw.trim() === '') {
      onValueChange(undefined);
      return;
    }
    const next = Number(raw);
    if (Number.isFinite(next)) onValueChange(clampNumber(next, min, max));
  }

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
        onChange={(event) => update(event.target.value)}
        step={step}
        type="number"
        value={value ?? ''}
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
  id?: string | undefined;
  max?: number | undefined;
  min?: number | undefined;
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
  error,
  id,
  label,
  max,
  min,
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
    >
      <div className="ui-number-field-row">
        <NumberControl
          ariaLabel={label ?? 'Number value'}
          disabled={disabled}
          id={inputId}
          max={max}
          min={min}
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
  id?: string | undefined;
  max?: number | undefined;
  min?: number | undefined;
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
  error,
  id,
  label,
  max,
  min,
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
    >
      <div className="ui-unit-control">
        <NumberControl
          ariaLabel={label ?? 'Dimension'}
          disabled={disabled || selectedUnit === 'auto'}
          id={inputId}
          max={max}
          min={min}
          onValueChange={(nextValue) => update(nextValue)}
          step={step}
          value={parsed.value}
        />
        <select
          aria-label="Unit"
          className="ui-control ui-unit-select"
          disabled={disabled}
          id={`${inputId}-unit`}
          onChange={(event) => update(parsed.value, event.target.value as UnitSelection)}
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
            if (
              !normalizeHexColor(event.target.value) &&
              event.target.value.trim() !== ''
            ) {
              setDraft(value ?? '');
            }
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            if (normalizeHexColor(event.target.value)) commit(event.target.value);
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
        <span className="ui-field-description">Four-sided spacing</span>
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
    </Field>
  );
}
