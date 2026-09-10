'use client';

import type { ComponentSlotDefinition, PageComponentType } from '@payload/contracts';
import type { ReactNode } from 'react';
import { StructureItem } from './structure-item';

export function StructureSlot({
  children,
  onAdd,
  onDelete,
  onDuplicate,
  onMove,
  onDrop,
  onSelect,
  slot,
}: {
  children: ReadonlyArray<{ id: string; type: PageComponentType; label: string }>;
  onAdd: (childType: PageComponentType) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onMove: (nodeId: string, direction: 'up' | 'down') => void;
  onDrop: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  onSelect: (nodeId: string) => void;
  slot: ComponentSlotDefinition;
}): ReactNode {
  const atMinimum = slot.minChildren !== undefined && children.length <= slot.minChildren;
  const atMaximum = slot.maxChildren !== undefined && children.length >= slot.maxChildren;
  const [firstType] = slot.accepts;
  return (
    <section aria-label={slot.label} className="builder-structure-slot">
      <div className="builder-structure-slot-heading">
        <strong>{slot.label}</strong>
        <span className="muted small">
          {children.length}
          {slot.maxChildren === undefined ? '' : ` / ${slot.maxChildren}`}
        </span>
      </div>
      <div className="builder-structural-editor">
        {children.map((child, index) => (
          <StructureItem
            id={child.id}
            key={child.id}
            label={child.label}
            onDelete={() => onDelete(child.id)}
            onDuplicate={() => onDuplicate(child.id)}
            onMoveDown={() => onMove(child.id, 'down')}
            onMoveUp={() => onMove(child.id, 'up')}
            onDrop={onDrop}
            onSelect={() => onSelect(child.id)}
            position={{ first: index === 0, last: index === children.length - 1 }}
            removeDisabled={atMinimum}
            duplicateDisabled={atMaximum}
          />
        ))}
        {atMinimum ? (
          <p className="muted small">Keep at least {slot.minChildren} item.</p>
        ) : null}
        {atMaximum ? <p className="muted small">This slot is full.</p> : null}
        {slot.accepts.length > 1 ? (
          <div className="builder-structure-add-picker">
            {slot.accepts.map((type) => (
              <button
                className="button button-secondary button-small"
                disabled={atMaximum}
                key={type}
                onClick={() => onAdd(type)}
                type="button"
              >
                + {slot.addLabel ?? 'Add'} {type}
              </button>
            ))}
          </div>
        ) : (
          <button
            className="button button-secondary button-small"
            disabled={atMaximum || !firstType}
            onClick={() => firstType && onAdd(firstType)}
            type="button"
          >
            + {slot.addLabel ?? `Add ${slot.label}`}
          </button>
        )}
      </div>
    </section>
  );
}
