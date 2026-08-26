'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type SurfaceSize = 'sm' | 'md' | 'lg' | 'fullscreen';

type SurfaceHeaderProps = {
  eyebrow?: string | undefined;
  description?: string | undefined;
  title: string;
};

type OverlayProps = SurfaceHeaderProps & {
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: SurfaceSize | undefined;
};

function useOverlay(open: boolean, onClose: () => void) {
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
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    const firstFocusable =
      surfaceRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ?? surfaceRef.current?.querySelector<HTMLElement>('button:not([disabled])');
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
  children,
  description,
  eyebrow,
  footer,
  headerActions,
  onClose,
  open,
  size = 'lg',
  title,
}: OverlayProps) {
  const { mounted, surfaceRef } = useOverlay(open, onClose);
  if (!mounted || !open) return null;

  return (
    <div className="ui-overlay-layer ui-drawer-layer" role="presentation">
      <button
        aria-label="Close dialog"
        className="ui-overlay-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label={title}
        aria-modal="true"
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
