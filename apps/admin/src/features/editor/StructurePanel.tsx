'use client';

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MAX_SECTIONS, type SectionInstance } from '@plp/contracts';
import { canMoveSection, getSectionDefinition } from '@plp/sections/schema';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  DragHandleIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  Tooltip,
} from '@plp/ui';
import { type ReactNode, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { ThemeDots } from '../theme';
import { useEditor, useEditorServices, useEditorStoreApi } from './editor-context';
import { groupLabels } from './presentation';
import { visibilityGroupOf } from './store';
import styles from './StructurePanel.module.css';

type FocusControl = 'up' | 'down' | 'select';

function controlId(sectionId: string, control: FocusControl): string {
  return `${sectionId}:${control}`;
}

function kindOf(section: SectionInstance): string {
  return getSectionDefinition(section.type).label;
}

function summaryOf(section: SectionInstance): string {
  return getSectionDefinition(section.type).summarize(section.content);
}

interface SmallButtonProps {
  label: string;
  tooltip: string;
  icon: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  control?: string;
  onClick: () => void;
}

/** Compact icon button for the structure rows (32 px, as on the board). */
function SmallButton({
  label,
  tooltip,
  icon,
  disabled,
  pressed,
  control,
  onClick,
}: SmallButtonProps) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      data-structure-control={control}
      className={styles.smallButton}
      onClick={onClick}
    >
      {icon}
    </button>
  );
  return disabled ? button : <Tooltip content={tooltip}>{button}</Tooltip>;
}

interface RowProps {
  section: SectionInstance;
  index: number;
  selected: boolean;
  /** Title of the first blocking check of this section, e.g. "Nút chính chưa có đích". */
  error: string | null;
  canUp: boolean;
  canDown: boolean;
  onMove: (section: SectionInstance, toIndex: number, control: FocusControl) => void;
  onToggleVisibility: (section: SectionInstance) => void;
}

function StructureRow({
  section,
  index,
  selected,
  error,
  canUp,
  canDown,
  onMove,
  onToggleVisibility,
}: RowProps) {
  const store = useEditorStoreApi();
  const device = useEditor((state) => state.device);
  const fixed = getSectionDefinition(section.type).position !== undefined;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: fixed });
  const kind = kindOf(section);
  const group = visibilityGroupOf(device);
  const visible = section.visibility[group];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        styles.row,
        selected ? styles.rowSelected : undefined,
        isDragging ? styles.dragging : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {fixed ? (
        <span className={styles.handleSpacer} aria-hidden="true" />
      ) : (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-roledescription="section có thể sắp xếp"
          aria-label={`Kéo để sắp xếp ${kind}`}
          className={styles.handle}
        >
          <DragHandleIcon size={16} />
        </button>
      )}
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        data-structure-control={controlId(section.id, 'select')}
        className={styles.select}
        onClick={() => {
          store.getState().select(section.id);
        }}
      >
        <span className={styles.kind}>
          <span className={styles.kindText}>{kind}</span>
          {error === null ? null : (
            <span role="img" aria-label="Có lỗi" className={styles.errorDot} />
          )}
        </span>
        <span className={styles.summary}>{summaryOf(section)}</span>
        {error === null ? null : <span className={styles.errorBadge}>{error}</span>}
        {section.visibility.mobile ? null : (
          <span className={styles.badge}>Ẩn trên điện thoại</span>
        )}
        {section.visibility.desktop ? null : <span className={styles.badge}>Ẩn trên máy tính</span>}
      </button>
      {selected ? (
        <>
          <SmallButton
            label={`Chuyển ${kind} lên trên`}
            tooltip="Lên (Alt+↑)"
            icon={<ArrowUpIcon size={16} />}
            disabled={!canUp}
            control={controlId(section.id, 'up')}
            onClick={() => {
              onMove(section, index - 1, 'up');
            }}
          />
          <SmallButton
            label={`Chuyển ${kind} xuống dưới`}
            tooltip="Xuống (Alt+↓)"
            icon={<ArrowDownIcon size={16} />}
            disabled={!canDown}
            control={controlId(section.id, 'down')}
            onClick={() => {
              onMove(section, index + 1, 'down');
            }}
          />
        </>
      ) : null}
      <SmallButton
        label={`Ẩn hoặc hiện ${kind}`}
        tooltip={visible ? `Ẩn trên ${groupLabels[group]}` : `Hiện trên ${groupLabels[group]}`}
        pressed={!visible}
        icon={visible ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
        onClick={() => {
          onToggleVisibility(section);
        }}
      />
    </li>
  );
}

export interface StructurePanelProps {
  /** Opens the site theme picker ("Giao diện site · màu & chữ"). */
  onOpenTheme: () => void;
}

/** "CẤU TRÚC TRANG": the ordered sections, sortable by drag, buttons and keyboard. */
export function StructurePanel({ onOpenTheme }: StructurePanelProps) {
  const store = useEditorStoreApi();
  const { openAddSection, announce } = useEditorServices();
  const sections = useEditor((state) => state.draft.composition.sections);
  const selectedId = useEditor((state) => state.selection.sectionId);
  const blocking = useEditor((state) => state.checks.blocking);
  const device = useEditor((state) => state.device);
  const theme = useEditor((state) => state.site.themePresetId);
  // A stable id keeps dnd-kit's generated ARIA ids equal on the server and the client.
  const dndId = useId();
  const focusRequest = useRef<{ sectionId: string; control: FocusControl } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // The reason of the first blocking check per section, shown as a badge on its row (board 03).
  const errors = useMemo(() => {
    const bySection = new Map<string, string>();
    for (const item of blocking) {
      const target = item.target;
      // A form missing its consent settings (ADR-017) or its lead destination (ADR-018) is
      // pointed at through the site setting it needs.
      const sectionId =
        target.kind === 'section' || target.kind === 'privacy' || target.kind === 'lead_recipients'
          ? target.sectionId
          : null;
      if (sectionId !== null && !bySection.has(sectionId)) {
        bySection.set(sectionId, item.title);
      }
    }
    return bySection;
  }, [blocking]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Keep keyboard focus on the moved row: reordering the list can move the focused node.
  useLayoutEffect(() => {
    const request = focusRequest.current;
    if (!request || !listRef.current) {
      return;
    }
    focusRequest.current = null;
    const find = (control: FocusControl) =>
      listRef.current?.querySelector<HTMLButtonElement>(
        `[data-structure-control="${controlId(request.sectionId, control)}"]`,
      );
    const preferred = find(request.control);
    (preferred && !preferred.disabled ? preferred : find('select'))?.focus();
  }, [sections]);

  const count = sections.length;
  const indexOf = (id: UniqueIdentifier) => sections.findIndex((section) => section.id === id);
  const labelOf = (id: UniqueIdentifier) => {
    const section = sections[indexOf(id)];
    return section ? kindOf(section) : '';
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Đã nhấc section ${labelOf(active.id)}. Vị trí hiện tại ${indexOf(active.id) + 1} / ${count}. Dùng phím mũi tên để di chuyển, Space để thả, Escape để hủy.`,
    onDragOver: ({ over }) =>
      over ? `Đã chuyển tới vị trí ${indexOf(over.id) + 1} / ${count}.` : undefined,
    onDragEnd: ({ active, over }) => {
      const from = indexOf(active.id);
      const to = over ? indexOf(over.id) : from;
      if (to !== from && !canMoveSection(sections, from, to)) {
        return `Không thể chuyển ${labelOf(active.id)} tới vị trí ${to + 1}. Section giữ vị trí ${from + 1}.`;
      }
      return `Đã thả section ${labelOf(active.id)} ở vị trí ${to + 1} / ${count}.`;
    },
    onDragCancel: ({ active }) =>
      `Đã hủy kéo. Section ${labelOf(active.id)} giữ vị trí ${indexOf(active.id) + 1} / ${count}.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }
    store.getState().moveSection(String(active.id), indexOf(over.id));
  }

  function move(section: SectionInstance, toIndex: number, control: FocusControl) {
    if (store.getState().moveSection(section.id, toIndex)) {
      focusRequest.current = { sectionId: section.id, control };
      announce(`Đã chuyển ${kindOf(section)} tới vị trí ${toIndex + 1} / ${count}.`);
    }
  }

  function toggleVisibility(section: SectionInstance) {
    const group = visibilityGroupOf(store.getState().device);
    const visible = !section.visibility[group];
    if (store.getState().setVisibility(section.id, group, visible)) {
      announce(`${visible ? 'Đã hiện' : 'Đã ẩn'} ${kindOf(section)} trên ${groupLabels[group]}.`);
    }
  }

  const selectedIndex = sections.findIndex((section) => section.id === selectedId);
  const full = count >= MAX_SECTIONS;

  return (
    <nav aria-labelledby="structure-title" className={styles.panel} data-device={device}>
      <div className={styles.header}>
        <h2 id="structure-title" className={styles.title}>
          CẤU TRÚC TRANG
        </h2>
        <span className={styles.count}>{count} section</span>
      </div>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Để sắp xếp, nhấn Space hoặc Enter để nhấc section, dùng phím mũi tên lên xuống để di chuyển, nhấn Space hoặc Enter để thả, Escape để hủy.',
          },
        }}
      >
        <SortableContext
          items={sections.map((section) => section.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol ref={listRef} className={styles.list}>
            {sections.map((section, index) => (
              <StructureRow
                key={section.id}
                section={section}
                index={index}
                selected={section.id === selectedId}
                error={errors.get(section.id) ?? null}
                canUp={canMoveSection(sections, index, index - 1)}
                canDown={canMoveSection(sections, index, index + 1)}
                onMove={move}
                onToggleVisibility={toggleVisibility}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.add}
          disabled={full}
          aria-describedby={full ? 'structure-full' : undefined}
          onClick={() => {
            openAddSection(selectedIndex === -1 ? count : selectedIndex + 1);
          }}
        >
          <PlusIcon size={18} />
          Thêm section
        </button>
        {full ? (
          <p id="structure-full" className={styles.fullNote}>
            Một trang có tối đa {MAX_SECTIONS} section.
          </p>
        ) : null}
      </div>
      <div className={styles.themeRow}>
        <button type="button" className={styles.theme} onClick={onOpenTheme}>
          <ThemeDots themePresetId={theme} />
          <span className={styles.themeLabel}>Giao diện site · màu &amp; chữ</span>
          <ChevronRightIcon size={18} />
        </button>
      </div>
    </nav>
  );
}
