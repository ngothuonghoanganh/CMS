'use client';

import { imageRefSchema, type SectionInstance } from '@plp/contracts';
import { canMoveSection, collectLeaves, getSectionDefinition } from '@plp/sections/schema';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ConfirmDialog,
  DuplicateIcon,
  EyeOffIcon,
  IconButton,
  PlusIcon,
  TrashIcon,
  WarningTriangleIcon,
} from '@plp/ui';
import { type KeyboardEvent, type ReactElement, useState } from 'react';
import styles from './Canvas.module.css';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import { focusOutlineRow } from './focus-target';
import { groupLabels } from './presentation';
import { visibilityGroupOf } from './store';

/** Image fields with an asset but neither a description nor the "decorative" flag. */
export function imagesMissingAlt(section: SectionInstance): string[] {
  return collectLeaves(section)
    .filter((leaf) => leaf.field.kind === 'image')
    .flatMap((leaf) => {
      const image = imageRefSchema.safeParse(leaf.value);
      return image.success &&
        image.data.assetId !== null &&
        !image.data.decorative &&
        image.data.alt.trim() === ''
        ? [leaf.path]
        : [];
    });
}

/** Arrow keys also move between the buttons of a toolbar, as screen reader users expect. */
function moveToolbarFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  );
  const current = buttons.findIndex((button) => button === document.activeElement);
  if (current === -1) {
    return;
  }
  event.preventDefault();
  const step = event.key === 'ArrowRight' ? 1 : -1;
  buttons[(current + step + buttons.length) % buttons.length]?.focus();
}

export interface SectionChromeProps {
  section: SectionInstance;
  index: number;
  rendered: ReactElement;
}

/**
 * Canvas frame around one rendered section: click to select, selection outline and label, the
 * floating toolbar, the "Thêm section ở đây" insertion point and a placeholder when the section
 * is hidden on the device being previewed. Every action calls the same store commands as the
 * structure panel.
 */
export function SectionChrome({ section, index, rendered }: SectionChromeProps) {
  const store = useEditorStoreApi();
  const { openAddSection, announce, focusTarget } = useEditorServices();
  const sections = useEditor((state) => state.draft.composition.sections);
  const selected = useEditor((state) => state.selection.sectionId === section.id);
  const device = useEditor((state) => state.device);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const definition = getSectionDefinition(section.type);
  const kind = definition.label;
  const group = visibilityGroupOf(device);
  const hidden = !section.visibility[group];
  const missingAlt = imagesMissingAlt(section);
  const canInsertAfter = definition.position !== 'last';

  function select() {
    if (store.getState().selection.sectionId !== section.id) {
      store.getState().select(section.id);
    }
  }

  function move(toIndex: number) {
    if (store.getState().moveSection(section.id, toIndex)) {
      announce(`Đã chuyển ${kind} tới vị trí ${toIndex + 1} / ${sections.length}.`);
    }
  }

  return (
    <div
      className={[styles.chrome, selected ? styles.selected : undefined].filter(Boolean).join(' ')}
      data-section-id={section.id}
      onClick={select}
      onFocus={select}
    >
      <span className={styles.chip} aria-hidden="true">
        {kind}
      </span>
      {selected ? (
        <div
          role="toolbar"
          aria-label={`Thao tác với section ${kind}`}
          className={styles.toolbar}
          onKeyDown={moveToolbarFocus}
        >
          <IconButton
            size="sm"
            aria-label="Chuyển lên"
            icon={<ArrowUpIcon size={18} />}
            disabled={!canMoveSection(sections, index, index - 1)}
            onClick={() => {
              move(index - 1);
            }}
          />
          <IconButton
            size="sm"
            aria-label="Chuyển xuống"
            icon={<ArrowDownIcon size={18} />}
            disabled={!canMoveSection(sections, index, index + 1)}
            onClick={() => {
              move(index + 1);
            }}
          />
          <IconButton
            size="sm"
            aria-label="Nhân bản section"
            icon={<DuplicateIcon size={18} />}
            disabled={definition.singleton}
            onClick={() => {
              if (store.getState().duplicateSection(section.id)) {
                announce(`Đã nhân bản ${kind}.`);
              }
            }}
          />
          <IconButton
            size="sm"
            aria-label="Ẩn section"
            icon={<EyeOffIcon size={18} />}
            onClick={() => {
              if (store.getState().setVisibility(section.id, group, false)) {
                announce(`Đã ẩn ${kind} trên ${groupLabels[group]}.`);
              }
            }}
          />
          <IconButton
            size="sm"
            variant="danger"
            aria-label="Xóa section"
            icon={<TrashIcon size={18} />}
            onClick={() => {
              setConfirmDelete(true);
            }}
          />
        </div>
      ) : null}
      {hidden ? (
        <div className={styles.hidden}>
          <span>
            {kind} đang ẩn trên {groupLabels[group]}.
          </span>
          <button
            type="button"
            className={styles.hiddenAction}
            onClick={() => {
              if (store.getState().setVisibility(section.id, group, true)) {
                announce(`Đã hiện ${kind} trên ${groupLabels[group]}.`);
              }
            }}
          >
            Hiện trên {groupLabels[group]}
          </button>
        </div>
      ) : (
        rendered
      )}
      {missingAlt.length > 0 && !hidden ? (
        <button
          type="button"
          className={styles.altWarning}
          onClick={(event) => {
            event.stopPropagation();
            const path = missingAlt[0];
            if (path) {
              focusTarget({ kind: 'section', sectionId: section.id, fieldPath: path });
            }
          }}
        >
          <WarningTriangleIcon size={14} strokeWidth={2} />
          {missingAlt.length > 1 ? `Thiếu mô tả ảnh (${missingAlt.length})` : 'Thiếu mô tả ảnh'}
        </button>
      ) : null}
      {canInsertAfter ? (
        <div className={styles.insert}>
          <button
            type="button"
            className={styles.insertButton}
            onClick={(event) => {
              event.stopPropagation();
              openAddSection(index + 1);
            }}
          >
            <PlusIcon size={16} />
            Thêm section ở đây
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Xóa section ${kind}?`}
        description="Section và nội dung của nó sẽ bị xóa khỏi bản nháp. Bạn có thể hoàn tác bằng Ctrl+Z."
        confirmLabel="Xóa section"
        tone="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          // The deleted section's controls disappear; keyboard users continue from a neighbour.
          const neighbour = sections[index + 1] ?? sections[index - 1];
          if (store.getState().removeSection(section.id)) {
            announce(`Đã xóa ${kind}.`);
            if (neighbour) {
              focusOutlineRow(neighbour.id);
            }
          }
        }}
      />
    </div>
  );
}
