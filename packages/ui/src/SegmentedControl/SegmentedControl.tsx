'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../internal/cx';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<V extends string> {
  value: V;
  /** Visible text, or the accessible name and tooltip when `iconOnly`. */
  label: string;
  icon?: ReactNode;
  /** Show only the icon (device switch). */
  iconOnly?: boolean | undefined;
  disabled?: boolean | undefined;
}

export interface SegmentedControlProps<V extends string> {
  /** Name of the group, e.g. "Xem theo thiết bị". */
  'aria-label': string;
  options: ReadonlyArray<SegmentedOption<V>>;
  value: V;
  onChange: (value: V) => void;
  /** Equal-width segments that fill the container (spacing presets). */
  fullWidth?: boolean | undefined;
  className?: string | undefined;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

/** Arrow keys move focus between segments; Enter or Space selects (native buttons). */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
  if (step === 0) {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  );
  const current = buttons.findIndex((button) => button === document.activeElement);
  if (current === -1) {
    return;
  }
  event.preventDefault();
  const next = buttons[(current + step + buttons.length) % buttons.length];
  next?.focus();
}

/** A row of toggle buttons where exactly one is pressed: device, spacing and status filters. */
export function SegmentedControl<V extends string>({
  'aria-label': ariaLabel,
  options,
  value,
  onChange,
  fullWidth = false,
  className,
}: SegmentedControlProps<V>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(styles.group, fullWidth && styles.fullWidth, className)}
      onKeyDown={moveFocus}
    >
      {options.map((option) => {
        const pressed = option.value === value;
        const iconOnly = option.iconOnly === true;
        const button = (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            aria-label={iconOnly ? option.label : undefined}
            disabled={option.disabled}
            className={cx(styles.item, iconOnly && styles.iconOnly)}
            onClick={() => {
              if (!pressed) {
                onChange(option.value);
              }
            }}
          >
            {option.icon ? <span className={styles.icon}>{option.icon}</span> : null}
            {iconOnly ? null : option.label}
          </button>
        );
        return iconOnly ? (
          <Tooltip key={option.value} content={option.label}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
