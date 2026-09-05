'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';

type SurfaceSize = 'sm' | 'md' | 'lg' | 'fullscreen';

type SurfaceHeaderProps = {
  eyebrow?: string | undefined;
  description?: string | undefined;
  title: string;
};

type OverlayProps = SurfaceHeaderProps & {
  allowBackgroundInteraction?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  inline?: boolean;
  onClose: () => void;
  open: boolean;
  size?: SurfaceSize | undefined;
};

const focusableSelector = [
  'a[href]:not([aria-hidden="true"])',
  'button:not([disabled]):not([aria-hidden="true"])',
  'input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"])',
  'select:not([disabled]):not([aria-hidden="true"])',
  'textarea:not([disabled]):not([aria-hidden="true"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
  '[contenteditable="true"]:not([aria-hidden="true"])',
].join(', ');

function getFocusableElements(surface: HTMLElement): HTMLElement[] {
  return Array.from(surface.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hidden,
  );
}

function useOverlay(
  open: boolean,
  onClose: () => void,
  allowBackgroundInteraction = false,
) {
  const [mounted, setMounted] = useState(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (!allowBackgroundInteraction) document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (allowBackgroundInteraction || event.key !== 'Tab') return;

      const surface = surfaceRef.current;
      if (!surface) return;
      const focusable = getFocusableElements(surface);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement as HTMLElement | null;
      const activeIndex = active ? focusable.indexOf(active) : -1;
      if (activeIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeIndex === 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [allowBackgroundInteraction, open]);

  useEffect(() => {
    if (!mounted || !open) return;
    const firstFocusable = surfaceRef.current
      ? getFocusableElements(surfaceRef.current)[0]
      : undefined;
    firstFocusable?.focus();
  }, [mounted, open]);

  return { mounted, surfaceRef };
}

function SurfaceHeader({
  description,
  eyebrow,
  headerActions,
  onClose,
  title,
}: SurfaceHeaderProps & { headerActions?: ReactNode; onClose: () => void }) {
  return (
    <header className="ui-surface-header">
      <div className="ui-surface-heading">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      <div className="ui-surface-header-actions">
        {headerActions}
        <button
          aria-label="Close dialog"
          className="button button-small button-ghost"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
    </header>
  );
}

export function Modal({
  children,
  description,
  eyebrow,
  footer,
  headerActions,
  onClose,
  open,
  size = 'md',
  title,
}: OverlayProps) {
  const { mounted, surfaceRef } = useOverlay(open, onClose);
  if (!mounted || !open) return null;

  return (
    <div className="ui-overlay-layer" role="presentation">
      <button
        aria-label="Close dialog"
        className="ui-overlay-backdrop"
        onClick={onClose}
        type="button"
      />
      <section
        aria-label={title}
        aria-modal="true"
        className={`ui-surface ui-modal ui-modal-${size}`}
        ref={surfaceRef}
        role="dialog"
      >
        <SurfaceHeader
          description={description}
          eyebrow={eyebrow}
          headerActions={headerActions}
          onClose={onClose}
          title={title}
        />
        <div className="ui-surface-body">{children}</div>
        {footer ? <footer className="ui-surface-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function Drawer({
  allowBackgroundInteraction = false,
  children,
  description,
  eyebrow,
  footer,
  headerActions,
  inline = false,
  onClose,
  open,
  size = 'lg',
  title,
}: OverlayProps) {
  const { mounted, surfaceRef } = useOverlay(
    open,
    onClose,
    allowBackgroundInteraction || inline,
  );
  if (!mounted || !open) return null;

  if (inline) {
    return (
      <section
        aria-label={title}
        className={`ui-surface ui-inline-surface ui-drawer-${size}`}
        ref={surfaceRef}
        role="region"
      >
        <SurfaceHeader
          description={description}
          eyebrow={eyebrow}
          headerActions={headerActions}
          onClose={onClose}
          title={title}
        />
        <div className="ui-surface-body">{children}</div>
        {footer ? <footer className="ui-surface-footer">{footer}</footer> : null}
      </section>
    );
  }

  return (
    <div
      className={`ui-overlay-layer ui-drawer-layer${
        allowBackgroundInteraction ? ' ui-drawer-layer-interactive' : ''
      }`}
      role="presentation"
    >
      <button
        aria-label="Close dialog"
        className="ui-overlay-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label={title}
        aria-modal={allowBackgroundInteraction ? undefined : true}
        className={`ui-surface ui-drawer ui-drawer-${size}`}
        ref={surfaceRef}
        role="dialog"
      >
        <SurfaceHeader
          description={description}
          eyebrow={eyebrow}
          headerActions={headerActions}
          onClose={onClose}
          title={title}
        />
        <div className="ui-surface-body">{children}</div>
        {footer ? <footer className="ui-surface-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function DataTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className="table-shell">
      <table className={`data-table${className ? ` ${className}` : ''}`}>
        {children}
      </table>
    </div>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="empty-state" role="status">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div aria-busy="true" className="ui-loading-state" role="status">
      <span className="skeleton ui-loading-indicator" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  action,
  message,
  title = 'Something went wrong',
}: {
  action?: ReactNode;
  message: string;
  title?: string;
}) {
  return (
    <div className="empty-state empty-state-error" role="alert">
      <strong>{title}</strong>
      <span>{message}</span>
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function PaginationControls({
  busy = false,
  className,
  noun = 'items',
  onNext,
  onPrevious,
  pagination,
}: {
  busy?: boolean;
  className?: string | undefined;
  noun?: string;
  onNext: () => void;
  onPrevious: () => void;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasNextPage: boolean;
  };
}) {
  const first = pagination.total ? pagination.offset + 1 : 0;
  const last = Math.min(pagination.offset + pagination.limit, pagination.total);
  return (
    <nav
      aria-label={`${noun} pagination`}
      className={`form-actions pagination-actions${className ? ` ${className}` : ''}`}
    >
      <button
        className="button button-small button-ghost"
        disabled={busy || pagination.offset === 0}
        onClick={onPrevious}
        type="button"
      >
        Previous
      </button>
      <span aria-live="polite" className="muted small">
        {first}–{last} of {pagination.total} {noun}
      </span>
      <button
        className="button button-small button-ghost"
        disabled={busy || !pagination.hasNextPage}
        onClick={onNext}
        type="button"
      >
        Next
      </button>
    </nav>
  );
}

export function PageHeader({
  actions,
  children,
  description,
  eyebrow,
  title,
}: SurfaceHeaderProps & { actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="ui-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function ResourceToolbar({ children }: { children: ReactNode }) {
  return <div className="ui-resource-toolbar">{children}</div>;
}
