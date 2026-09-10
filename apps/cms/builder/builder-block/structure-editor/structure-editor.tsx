'use client';

import { PAGE_COMPONENT_REGISTRY, type PageComponentType } from '@payload/contracts';
import type { ReactNode } from 'react';
import type { SelectedBuilderNode } from '../../grapes-editor';
import { StructureSlot } from './structure-slot';

export function StructureEditor({
  onAdd,
  onDelete,
  onDuplicate,
  onMove,
  onDrop,
  onSelect,
  selected,
}: {
  onAdd: (slotName: string, childType: PageComponentType) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onMove: (nodeId: string, direction: 'up' | 'down') => void;
  onDrop: (sourceId: string, targetId: string, position: 'before' | 'after') => void;
  onSelect: (nodeId: string) => void;
  selected: SelectedBuilderNode;
}): ReactNode {
  const slots = PAGE_COMPONENT_REGISTRY[selected.type].slots.filter(
    (slot) => slot.structural,
  );
  if (slots.length === 0) return null;
  return (
    <div className="builder-structure-editor">
      {slots.map((slot) => (
        <StructureSlot
          key={slot.name}
          onAdd={(childType) => onAdd(slot.name, childType)}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMove={onMove}
          onDrop={onDrop}
          onSelect={onSelect}
          slot={slot}
          children={selected.children.filter(
            (child) =>
              child.slot === slot.name ||
              (!child.slot && slot.accepts.includes(child.type)),
          )}
        />
      ))}
    </div>
  );
}
