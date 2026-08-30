'use client';

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
};

export function QuickAddOverlay({
  open,
  position = 'after',
  targetLabel,
  options,
  onClose,
  onInsert,
}: QuickAddOverlayProps) {
  if (!open) return null;
  return (
    <div className="builder-quick-add-overlay" aria-label="Quick add" role="dialog">
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
