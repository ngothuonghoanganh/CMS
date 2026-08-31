'use client';

import type { ReactNode } from 'react';

export function StructureItem({
  id,
  label,
  onDelete,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onDrop,
  onSelect,
  position,
  removeDisabled,
  duplicateDisabled,
}: {
  id: string;
  label: string;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onDrop: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  onSelect: () => void;
  position: { first: boolean; last: boolean };
  removeDisabled?: boolean;
  duplicateDisabled?: boolean;
}): ReactNode {
  return (
    <div
      className="builder-structural-row"
      draggable
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-payload-node-id')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData('application/x-payload-node-id');
        if (!sourceId || sourceId === id) return;
        const position =
          event.nativeEvent.offsetY < event.currentTarget.clientHeight / 2
            ? 'before'
            : 'after';
        onDrop(sourceId, id, position);
      }}
      onDragEnd={(event) => event.currentTarget.removeAttribute('data-dragging')}
      onDragStart={(event) => {
        event.currentTarget.setAttribute('data-dragging', 'true');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-payload-node-id', id);
      }}
    >
      <button
        className="button button-ghost builder-structural-select"
        onClick={onSelect}
        type="button"
      >
        {label}
      </button>
      <div className="row-actions">
        <button
          aria-label={`Move ${label} up`}
          className="button button-ghost button-small"
          disabled={position.first}
          onClick={onMoveUp}
          type="button"
        >
          ↑
        </button>
        <button
          aria-label={`Move ${label} down`}
          className="button button-ghost button-small"
          disabled={position.last}
          onClick={onMoveDown}
          type="button"
        >
          ↓
        </button>
        <button
          aria-label={`Duplicate ${label}`}
          className="button button-ghost button-small"
          disabled={duplicateDisabled}
          onClick={onDuplicate}
          type="button"
        >
          Copy
        </button>
        <button
          aria-label={`Remove ${label}`}
          className="button button-danger button-small"
          disabled={removeDisabled}
          onClick={onDelete}
          type="button"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
