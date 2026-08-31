'use client';

import type { CSSProperties } from 'react';
import type { SelectedBuilderNode } from '../grapes-editor';

type BuilderContextToolbarProps = {
  selected: SelectedBuilderNode | null;
  onSelectParent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onQuickAdd: () => void;
  onSaveAsReusable?: () => void;
  onDetachReusable?: () => void;
  position?: { left: number; top: number; placement: 'above' | 'below' } | undefined;
};

/** Small, deliberately limited canvas action surface. Detail editing stays in Inspector. */
export function BuilderContextToolbar({
  selected,
  onSelectParent,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  onQuickAdd,
  onSaveAsReusable,
  onDetachReusable,
  position,
}: BuilderContextToolbarProps) {
  if (!selected) return null;
  const style: CSSProperties | undefined = position
    ? { left: `${position.left}px`, top: `${position.top}px` }
    : undefined;
  return (
    <div
      aria-label="Selected element actions"
      className="builder-context-toolbar"
      data-placement={position?.placement}
      style={style}
    >
      <span className="builder-context-toolbar-label">{selected.type}</span>
      <button aria-label="Add after selected element" onClick={onQuickAdd} type="button">
        + Add
      </button>
      {selected.type !== 'root' ? (
        <>
          {selected.type === 'reusable-instance' && onDetachReusable ? (
            <button
              aria-label="Detach reusable section"
              onClick={onDetachReusable}
              type="button"
            >
              Detach
            </button>
          ) : null}
          {selected.type !== 'reusable-instance' && onSaveAsReusable ? (
            <button
              aria-label="Save selected element as reusable"
              onClick={onSaveAsReusable}
              type="button"
            >
              Save
            </button>
          ) : null}
          <button aria-label="Select parent" onClick={onSelectParent} type="button">
            Parent
          </button>
          <button aria-label="Move selected up" onClick={onMoveUp} type="button">
            ↑
          </button>
          <button aria-label="Move selected down" onClick={onMoveDown} type="button">
            ↓
          </button>
          <button aria-label="Clone selected element" onClick={onDuplicate} type="button">
            Clone
          </button>
          <button aria-label="Remove selected element" onClick={onDelete} type="button">
            Remove
          </button>
        </>
      ) : null}
    </div>
  );
}
