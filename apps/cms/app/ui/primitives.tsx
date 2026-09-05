import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

import { Icon } from './icons';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ControlSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  className?: string | undefined;
  size?: ControlSize | undefined;
  variant?: ButtonVariant | undefined;
};

export function Button({
  className,
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`cms-button cms-button-${variant} cms-button-${size}${className ? ` ${className}` : ''}`}
      type={type}
      {...props}
    />
  );
}

export function IconButton({
  'aria-label': ariaLabel,
  children,
  className,
  size = 'md',
  variant = 'ghost',
  ...props
}: Omit<ButtonProps, 'children'> & { 'aria-label': string; children: ReactNode }) {
  return (
    <Button
      aria-label={ariaLabel}
      className={`cms-icon-button${className ? ` ${className}` : ''}`}
      size={size}
      variant={variant}
      {...props}
    >
      {children}
    </Button>
  );
}

export function Panel({
  children,
  className,
  as: Component = 'section',
}: {
  as?: 'div' | 'section' | 'article';
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <Component className={`cms-panel${className ? ` ${className}` : ''}`}>
      {children}
    </Component>
  );
}

export function SectionHeader({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <header className="cms-section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="cms-section-header-actions">{actions}</div> : null}
    </header>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return <span className={`cms-badge cms-badge-${tone}`}>{children}</span>;
}

export function Alert({
  children,
  title,
  tone = 'info',
}: {
  children: ReactNode;
  title?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div
      className={`cms-alert cms-alert-${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <strong>{title}</strong> : null}
      <span>{children}</span>
    </div>
  );
}

export function SearchField({
  className,
  label = 'Search',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  className?: string | undefined;
  label?: string;
}) {
  return (
    <label className={`cms-search-field${className ? ` ${className}` : ''}`}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="cms-search-field-icon">
        <Icon name="search" size={14} />
      </span>
      <input {...props} aria-label={label} type="search" />
    </label>
  );
}

export function Divider() {
  return <hr className="cms-divider" />;
}

export function Tabs<T extends string>({
  ariaLabel = 'Tabs',
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <div aria-label={ariaLabel} className="cms-tabs" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={option.value === value}
          className={option.value === value ? 'is-active' : undefined}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stack({
  children,
  className,
  gap = '4',
}: {
  children: ReactNode;
  className?: string | undefined;
  gap?: '2' | '3' | '4' | '6' | '8';
}) {
  return (
    <div className={`cms-stack cms-stack-${gap}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export function Inline({
  children,
  className,
  gap = '3',
}: {
  children: ReactNode;
  className?: string | undefined;
  gap?: '2' | '3' | '4' | '6';
}) {
  return (
    <div className={`cms-inline cms-inline-${gap}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export function Popover({ children, label }: { children: ReactNode; label: string }) {
  return (
    <details className="cms-popover">
      <summary className="cms-disclosure-trigger">{label}</summary>
      <div className="cms-popover-content">{children}</div>
    </details>
  );
}

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="cms-tooltip" data-tooltip={label} tabIndex={0}>
      {children}
    </span>
  );
}

export function DropdownMenu({
  items,
  label,
}: {
  items: readonly {
    disabled?: boolean;
    label: string;
    onSelect?: () => void;
  }[];
  label: string;
}) {
  return (
    <details className="cms-dropdown-menu">
      <summary className="cms-disclosure-trigger">{label}</summary>
      <div className="cms-dropdown-content" role="menu">
        {items.map((item) => (
          <button
            disabled={item.disabled}
            key={item.label}
            onClick={item.onSelect}
            role="menuitem"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}

export function Accordion({
  items,
}: {
  items: readonly {
    content: ReactNode;
    defaultOpen?: boolean;
    id: string;
    title: string;
  }[];
}) {
  return (
    <div className="cms-accordion">
      {items.map((item) => (
        <details {...(item.defaultOpen ? { open: true } : {})} key={item.id}>
          <summary>{item.title}</summary>
          <div className="cms-accordion-content">{item.content}</div>
        </details>
      ))}
    </div>
  );
}

export function Skeleton({ className, width }: { className?: string; width?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`cms-skeleton${className ? ` ${className}` : ''}`}
      style={width ? { width } : undefined}
    />
  );
}

export function Toast({
  children,
  title,
  tone = 'info',
}: {
  children: ReactNode;
  title?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div aria-live="polite" className={`cms-toast cms-toast-${tone}`} role="status">
      {title ? <strong>{title}</strong> : null}
      <span>{children}</span>
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: readonly { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="cms-breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href && index < items.length - 1 ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current={index === items.length - 1 ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
