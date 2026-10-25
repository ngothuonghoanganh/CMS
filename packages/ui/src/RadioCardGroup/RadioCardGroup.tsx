'use client';

import { type ReactNode, useId } from 'react';
import { cx } from '../internal/cx';
import { hasContent } from '../internal/hasContent';
import styles from './RadioCardGroup.module.css';

export interface RadioCardOption<V extends string> {
  value: V;
  /** Card title; it is the radio's accessible name. */
  label: ReactNode;
  /** Supporting text, announced as the radio's description. */
  description?: ReactNode;
  /** Icon in the square tile at the top left (goal cards). */
  icon?: ReactNode;
  /** Visual preview above the title (theme swatches, layout thumbnails). */
  preview?: ReactNode;
  disabled?: boolean | undefined;
}

export interface RadioCardGroupProps<V extends string> {
  /** Name of the group, e.g. "Mục tiêu của trang". Visually hidden unless `showLegend`. */
  legend: string;
  showLegend?: boolean | undefined;
  /** Radio group name. Generated when omitted. */
  name?: string | undefined;
  options: ReadonlyArray<RadioCardOption<V>>;
  /** Selected value, or `null` when nothing is chosen yet. */
  value: V | null;
  onChange: (value: V) => void;
  /** Minimum card width in pixels before the grid wraps. Defaults to 220. */
  minColumnWidth?: number | undefined;
  className?: string | undefined;
}

/**
 * Native radios styled as cards. The browser handles keyboard behaviour (Tab into the group,
 * arrow keys to change the selection).
 */
export function RadioCardGroup<V extends string>({
  legend,
  showLegend = false,
  name,
  options,
  value,
  onChange,
  minColumnWidth = 220,
  className,
}: RadioCardGroupProps<V>) {
  const baseId = useId();
  const groupName = name ?? `${baseId}-radio`;
  return (
    <fieldset className={cx(styles.fieldset, className)}>
      <legend className={showLegend ? styles.legend : styles.visuallyHidden}>{legend}</legend>
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` }}
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          const disabled = option.disabled === true;
          const titleId = `${baseId}-${index}-title`;
          const descriptionId = `${baseId}-${index}-description`;
          const hasDescription = hasContent(option.description);
          return (
            <label
              key={option.value}
              className={cx(styles.card, checked && styles.checked, disabled && styles.disabled)}
              data-checked={checked}
            >
              <span className={styles.header}>
                {hasContent(option.icon) ? (
                  <span className={styles.tile} aria-hidden="true">
                    {option.icon}
                  </span>
                ) : null}
                <input
                  type="radio"
                  name={groupName}
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  aria-labelledby={titleId}
                  aria-describedby={hasDescription ? descriptionId : undefined}
                  className={styles.radio}
                  onChange={() => {
                    onChange(option.value);
                  }}
                />
              </span>
              {hasContent(option.preview) ? (
                <span className={styles.preview}>{option.preview}</span>
              ) : null}
              <span id={titleId} className={styles.title}>
                {option.label}
              </span>
              {hasDescription ? (
                <span id={descriptionId} className={styles.description}>
                  {option.description}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
