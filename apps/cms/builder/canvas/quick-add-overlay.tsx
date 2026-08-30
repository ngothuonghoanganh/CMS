'use client';

import type { CSSProperties } from 'react';
import type { BuilderBlockType } from '../builder-adapter';
import type { DropPosition } from '../builder-interaction';

export type QuickAddOption = {
  type: BuilderBlockType;
  label: string;
};

type QuickAddOverlayProps = {
  open: boolean;
  position?: DropPosition | undefined;
  targetLabel?: string | undefined;
  options: readonly QuickAddOption[];
  onClose: () => void;
  onInsert: (type: BuilderBlockType) => void;
  anchor?: { left: number; top: number } | undefined;
};

export function QuickAddOverlay({
  open,
  position = 'after',
  targetLabel,
  options,
  onClose,
  onInsert,
  anchor,
}: QuickAddOverlayProps) {
  if (!open) return null;
  return (
    <div
      aria-label="Quick add"
      className="builder-quick-add-overlay"
      role="dialog"
      style={anchor as CSSProperties | undefined}
    >
      <div className="builder-quick-add-heading">
        <strong>
          Add {position === 'inside' ? 'inside' : 'after'}{' '}
          {targetLabel ?? 'selected element'}
        </strong>
        <button aria-label="Close quick add" onClick={onClose} type="button">
          ×
        </button>
      </div>
      <div className="builder-quick-add-options">
        {options.map((option) => (
          <button key={option.type} onClick={() => onInsert(option.type)} type="button">
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
