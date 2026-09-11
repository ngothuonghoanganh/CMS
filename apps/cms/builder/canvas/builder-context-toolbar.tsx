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

function contextLabel(type: string): string {
  const labels: Record<string, string> = {
    'global-footer': 'Footer',
    'global-header': 'Header',
    'reusable-instance': 'Reusable section',
    root: 'Page',
  };
  return (
    labels[type] ??
    type.replace(/[-_]+/g, ' ').replace(/^./, (value) => value.toUpperCase())
  );
}

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
      <span className="builder-context-toolbar-label">{contextLabel(selected.type)}</span>
      <button
        aria-label="Add after selected element"
        onClick={onQuickAdd}
        title="Add content near this element"
        type="button"
      >
        + Add
      </button>
      {selected.type !== 'root' ? (
        <>
          {selected.type === 'reusable-instance' && onDetachReusable ? (
            <button
              aria-label="Detach reusable section"
              onClick={onDetachReusable}
              title="Make this section editable on this page"
              type="button"
            >
              Make editable
            </button>
          ) : null}
          {selected.type !== 'reusable-instance' && onSaveAsReusable ? (
            <button
              aria-label="Save selected element as reusable"
              onClick={onSaveAsReusable}
              title="Save this section to reuse later"
              type="button"
            >
              Save to library
            </button>
          ) : null}
          <button
            aria-label="Select parent"
            onClick={onSelectParent}
            title="Select the containing section"
            type="button"
          >
            Parent section
          </button>
          <button
            aria-label="Move selected up"
            onClick={onMoveUp}
            title="Move this element up"
            type="button"
          >
            ↑ Move up
          </button>
          <button
            aria-label="Move selected down"
            onClick={onMoveDown}
            title="Move this element down"
            type="button"
          >
            ↓ Move down
          </button>
          <button
            aria-label="Clone selected element"
            onClick={onDuplicate}
            title="Create a copy of this element"
            type="button"
          >
            Duplicate
          </button>
          <button
            aria-label="Remove selected element"
            className="builder-context-toolbar-danger"
            onClick={onDelete}
            title="Delete this element"
            type="button"
          >
            Delete
          </button>
        </>
      ) : null}
    </div>
  );
}
