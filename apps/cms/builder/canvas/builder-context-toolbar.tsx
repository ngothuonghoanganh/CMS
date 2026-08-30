'use client';

import type { SelectedBuilderNode } from '../grapes-editor';

type BuilderContextToolbarProps = {
  selected: SelectedBuilderNode | null;
  onSelectParent: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onQuickAdd: () => void;
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
}: BuilderContextToolbarProps) {
  if (!selected) return null;
  return (
    <div className="builder-context-toolbar" aria-label="Selected element actions">
      <span className="builder-context-toolbar-label">{selected.type}</span>
      <button aria-label="Add after selected element" onClick={onQuickAdd} type="button">
        + Add
      </button>
      {selected.type !== 'root' ? (
        <>
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
