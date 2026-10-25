'use client';

import { getAtPath, isPathWithin, listMinimum, type ListField } from '@plp/sections/schema';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  ChevronRightIcon,
  IconButton,
  PlusIcon,
  TrashIcon,
} from '@plp/ui';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { isFieldHidden, listItemsOf } from '../content-fields';
import { useEditor, useEditorServices, useEditorStoreApi } from '../editor-context';
import { lowerFirst } from '../presentation';
import type { ControlProps } from './field-shared';
import styles from './fields.module.css';
import { LeafControl } from './LeafControl';

function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  const label = getAtPath(value, 'label');
  return typeof label === 'string' ? label : '';
}

/** Title and one-line summary of a list item for its collapsed header. */
function describeItem(field: ListField, item: Record<string, unknown>) {
  const title = textOf(item[field.itemTitleKey]).trim();
  const summaryField = field.itemFields.find(
    (candidate) => candidate.kind === 'text' && candidate.key !== field.itemTitleKey,
  );
  const summary = summaryField ? textOf(item[summaryField.key]).trim() : '';
  return { title, summary };
}

type ItemControl = 'toggle' | 'up' | 'down';

/** The control to focus after a move or a delete re-renders the list. */
type FocusRequest = { index: number; control: ItemControl } | { index: null; control: 'add' };

/**
 * A repeatable group ("Các lợi ích", "Câu hỏi"): items expand to their fields, move up or down,
 * and are added or removed within the list's limits, which disable the buttons beforehand. The
 * minimum can depend on the variant (the benefits grid needs 3 items).
 */
export function ListControl({ section, field, path }: ControlProps<ListField>) {
  const store = useEditorStoreApi();
  const { announce } = useEditorServices();
  const baseId = useId();
  const items = listItemsOf(section.content, path);
  const focusedPath = useEditor((state) =>
    state.selection.sectionId === section.id ? state.selection.fieldPath : null,
  );
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const itemLabel = lowerFirst(field.itemLabel);
  const minimum = listMinimum(section.type, section.variant, path);
  const atMin = items.length <= minimum;
  const atMax = items.length >= field.max;
  const minId = `${baseId}-min`;
  const maxId = `${baseId}-max`;
  const listRef = useRef<HTMLFieldSetElement>(null);
  const focusRequest = useRef<FocusRequest | null>(null);

  // Rows are keyed by position, so after a move the focused button belongs to the other item, and
  // a deleted row's button disappears: keyboard focus follows the moved item, or lands on the
  // item before the deleted one (or "Thêm" when none is left).
  useLayoutEffect(() => {
    const request = focusRequest.current;
    const root = listRef.current;
    if (request === null || root === null) {
      return;
    }
    focusRequest.current = null;
    const find = (control: ItemControl | 'add', index: number | null) =>
      root.querySelector<HTMLButtonElement>(
        `[data-list-control="${index === null ? control : `${index}:${control}`}"]`,
      );
    if (request.index === null) {
      find('add', null)?.focus();
      return;
    }
    const other = request.control === 'up' ? 'down' : 'up';
    const target = [
      find(request.control, request.index),
      request.control === 'toggle' ? null : find(other, request.index),
      find('toggle', request.index),
    ].find((button) => button !== null && !button.disabled);
    target?.focus();
  }, [section.content]);

  function isExpanded(index: number): boolean {
    return (
      expanded.has(index) || (focusedPath !== null && isPathWithin(focusedPath, `${path}.${index}`))
    );
  }

  function toggle(index: number) {
    const open = isExpanded(index);
    const next = new Set(expanded);
    if (open) {
      next.delete(index);
      if (focusedPath !== null && isPathWithin(focusedPath, `${path}.${index}`)) {
        store.getState().select(section.id, null);
      }
    } else {
      next.add(index);
    }
    setExpanded(next);
  }

  function move(index: number, toIndex: number) {
    if (!store.getState().moveListItem(section.id, path, index, toIndex)) {
      return;
    }
    const next = new Set<number>();
    for (const open of expanded) {
      next.add(open === index ? toIndex : open === toIndex ? index : open);
    }
    setExpanded(next);
    focusRequest.current = { index: toIndex, control: toIndex > index ? 'down' : 'up' };
    announce(`Đã chuyển ${itemLabel} tới vị trí ${toIndex + 1} / ${items.length}.`);
  }

  function remove(index: number) {
    if (!store.getState().removeListItem(section.id, path, index)) {
      return;
    }
    const next = new Set<number>();
    for (const open of expanded) {
      if (open !== index) {
        next.add(open > index ? open - 1 : open);
      }
    }
    setExpanded(next);
    focusRequest.current =
      items.length > 1
        ? { index: Math.max(0, index - 1), control: 'toggle' }
        : { index: null, control: 'add' };
    announce(`Đã xóa ${itemLabel} ${index + 1}.`);
  }

  function add() {
    if (!store.getState().addListItem(section.id, path)) {
      return;
    }
    setExpanded(new Set(expanded).add(items.length));
    announce(`Đã thêm ${itemLabel} ${items.length + 1}.`);
  }

  return (
    <fieldset ref={listRef} data-field-path={path} className={styles.list}>
      <legend className={styles.listLegend}>
        {field.label}
        <span className={styles.listCount}>
          {items.length} / {field.max}
        </span>
      </legend>
      <ol className={styles.items}>
        {items.map((item, index) => {
          const open = isExpanded(index);
          const { title, summary } = describeItem(field, item);
          const bodyId = `${baseId}-item-${index}`;
          const name = `${itemLabel} ${index + 1}`;
          return (
            <li key={index} data-field-path={`${path}.${index}`} className={styles.item}>
              <div className={styles.itemHeader}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={bodyId}
                  data-list-control={`${index}:toggle`}
                  className={styles.itemToggle}
                  onClick={() => {
                    toggle(index);
                  }}
                >
                  <span className={open ? styles.chevronOpen : styles.chevron} aria-hidden="true">
                    <ChevronRightIcon size={16} />
                  </span>
                  <span className={styles.itemText}>
                    <span className={styles.itemTitle}>
                      {title === '' ? field.itemLabel : title}
                    </span>
                    {summary === '' ? null : <span className={styles.itemSummary}>{summary}</span>}
                  </span>
                </button>
                <IconButton
                  size="sm"
                  aria-label={`Chuyển ${name} lên`}
                  data-list-control={`${index}:up`}
                  icon={<ArrowUpIcon size={16} />}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, index - 1);
                  }}
                />
                <IconButton
                  size="sm"
                  aria-label={`Chuyển ${name} xuống`}
                  data-list-control={`${index}:down`}
                  icon={<ArrowDownIcon size={16} />}
                  disabled={index === items.length - 1}
                  onClick={() => {
                    move(index, index + 1);
                  }}
                />
                <IconButton
                  size="sm"
                  variant="danger"
                  aria-label={`Xóa ${name}`}
                  aria-describedby={atMin ? minId : undefined}
                  icon={<TrashIcon size={16} />}
                  disabled={atMin}
                  onClick={() => {
                    remove(index);
                  }}
                />
              </div>
              {open ? (
                <div id={bodyId} className={styles.itemBody}>
                  {field.itemFields
                    .filter((itemField) => !isFieldHidden(section, `${path}.${itemField.key}`))
                    .map((itemField) => (
                      <LeafControl
                        key={itemField.key}
                        section={section}
                        field={itemField}
                        path={`${path}.${index}.${itemField.key}`}
                      />
                    ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {atMin && items.length > 0 ? (
        <p id={minId} className={styles.note}>
          Cần ít nhất {minimum} {itemLabel}, nên chưa xóa được.
        </p>
      ) : null}
      <div className={styles.listActions}>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<PlusIcon size={16} />}
          data-list-control="add"
          disabled={atMax}
          aria-describedby={atMax ? maxId : undefined}
          onClick={add}
        >
          Thêm {itemLabel}
        </Button>
        {atMax ? (
          <span id={maxId} className={styles.note}>
            Tối đa {field.max} {itemLabel}
          </span>
        ) : null}
      </div>
    </fieldset>
  );
}
