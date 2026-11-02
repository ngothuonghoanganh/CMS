'use client';

import { DropdownMenu as RadixMenu } from 'radix-ui';
import { type ReactElement, type ReactNode } from 'react';
import { CheckIcon } from '../icons';
import { cx } from '../internal/cx';
import styles from './DropdownMenu.module.css';

export interface DropdownMenuProps {
  /**
   * The button that opens the menu, e.g. an `IconButton` "Tùy chọn khác cho …". It must accept a
   * ref and spread props; do not give it a tooltip (the tooltip wrapper would swallow them).
   */
  trigger: ReactElement;
  children: ReactNode;
  /** Alignment against the trigger. Defaults to `end`. */
  align?: 'start' | 'center' | 'end' | undefined;
  side?: 'top' | 'right' | 'bottom' | 'left' | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

/**
 * Menu of actions. Arrow keys move, Enter selects, Escape closes and returns focus.
 *
 * Not modal: Radix's modal menu hides the rest of the page with `aria-hidden` while it is open,
 * although the page keeps its links and buttons (WCAG 4.1.2, axe `aria-hidden-focus`). A menu is
 * not a dialog; Tab still stays in it and a click outside closes it.
 */
export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  open,
  onOpenChange,
  className,
}: DropdownMenuProps) {
  return (
    <RadixMenu.Root
      modal={false}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cx(styles.content, className)}
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

export interface DropdownMenuItemProps {
  children: ReactNode;
  /** Runs when the item is chosen; the menu then closes. */
  onSelect?: ((event: Event) => void) | undefined;
  icon?: ReactNode;
  /** `danger` for destructive actions such as "Gỡ xuất bản". */
  tone?: 'default' | 'danger' | undefined;
  disabled?: boolean | undefined;
  /**
   * A second line under the label, e.g. why the item is disabled ("Gỡ xuất bản trước khi xóa").
   * It is part of the item's name: everything visible must be in the name (WCAG 2.5.3, axe
   * `label-content-name-mismatch`), and a disabled item's reason is read with it.
   */
  description?: ReactNode;
}

export function DropdownMenuItem({
  children,
  onSelect,
  icon,
  tone = 'default',
  disabled = false,
  description,
}: DropdownMenuItemProps) {
  const described = description !== undefined && description !== null;
  return (
    <RadixMenu.Item
      {...(onSelect === undefined ? {} : { onSelect })}
      disabled={disabled}
      className={cx(styles.item, tone === 'danger' && styles.danger, described && styles.twoLines)}
      data-tone={tone}
    >
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {described ? (
        <span className={styles.lines}>
          <span className={styles.text}>{children}</span>{' '}
          <span className={styles.description}>{description}</span>
        </span>
      ) : (
        <span className={styles.text}>{children}</span>
      )}
    </RadixMenu.Item>
  );
}

export function DropdownMenuSeparator() {
  return <RadixMenu.Separator className={styles.separator} />;
}

/** Non-interactive heading for a group of items, e.g. "Workspace". */
export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className={styles.label}>{children}</RadixMenu.Label>;
}

export interface DropdownMenuRadioGroupProps<V extends string> {
  value: V;
  onValueChange: (value: V) => void;
  children: ReactNode;
}

/** A single choice inside a menu (workspace or site switcher); the current item shows a check. */
export function DropdownMenuRadioGroup<V extends string>({
  value,
  onValueChange,
  children,
}: DropdownMenuRadioGroupProps<V>) {
  return (
    <RadixMenu.RadioGroup
      value={value}
      onValueChange={(next) => {
        // Radix reports the value of a DropdownMenuRadioItem<V> rendered in this group.
        onValueChange(next as V);
      }}
    >
      {children}
    </RadixMenu.RadioGroup>
  );
}

export interface DropdownMenuRadioItemProps<V extends string> {
  value: V;
  children: ReactNode;
  disabled?: boolean | undefined;
}

export function DropdownMenuRadioItem<V extends string>({
  value,
  children,
  disabled = false,
}: DropdownMenuRadioItemProps<V>) {
  return (
    <RadixMenu.RadioItem value={value} disabled={disabled} className={styles.item}>
      <span className={styles.text}>{children}</span>
      <RadixMenu.ItemIndicator className={styles.indicator}>
        <CheckIcon size={16} strokeWidth={2.2} />
      </RadixMenu.ItemIndicator>
    </RadixMenu.RadioItem>
  );
}
