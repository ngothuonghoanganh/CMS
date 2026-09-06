'use client';

import {
  FormPropsSchema,
  ListPropsSchema,
  NavigationItemSchema,
  NavigationItemsSchema,
  NavigationViewPropsSchema,
  validateNavigationItems,
  type NavigationItem,
  type ComponentPropertyDefinition,
  type FormField,
  type FormProps,
  type ListProps,
  type Page,
} from '@payload/contracts';
import { SelectField, TextAreaField, TextField } from '../../app/ui/fields';
import { useRef, useState, type ReactNode } from 'react';
import { newBuilderUuid } from '../builder-adapter';
import {
  duplicateNavigationItem,
  findNavigationItem,
  indentNavigationItem,
  moveNavigationItem,
  moveNavigationItemTo,
  outdentNavigationItem,
  removeNavigationItem,
  updateNavigationItem,
} from '../../app/navigation/navigation-tree';

export type CustomPropertyEditorProps = {
  definition: ComponentPropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  navigationPages?: readonly Pick<Page, 'id' | 'name' | 'path' | 'anchors'>[];
};

function newItemId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `item-${(uuid ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

function newFieldId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `field-${(uuid ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

export function ListPropertyEditor({ value, onChange }: CustomPropertyEditorProps) {
  const parsed = ListPropsSchema.safeParse(value);
  if (!parsed.success) return null;
  const list = parsed.data;

  function update(patch: Partial<ListProps>) {
    onChange({ ...list, ...patch });
  }

  return (
    <div className="builder-list-editor">
      <div className="builder-property-control">
        <span className="builder-property-label">Items</span>
        <button
          className="button button-secondary button-small"
          disabled={list.items.length >= 100}
          onClick={() =>
            update({ items: [...list.items, { id: newItemId(), text: 'New item' }] })
          }
          type="button"
        >
          + Add item
        </button>
      </div>
      {list.items.map((item, index) => (
        <div className="builder-list-item" key={item.id}>
          <TextField
            compact
            label={`Item ${index + 1}`}
            onChange={(event) =>
              update({
                items: list.items.map((current) =>
                  current.id === item.id
                    ? { ...current, text: event.target.value }
                    : current,
                ),
              })
            }
            value={item.text}
          />
          <div className="row-actions">
            <button
              aria-label={`Move item ${index + 1} up`}
              className="button button-ghost button-small"
              disabled={index === 0}
              onClick={() => {
                const items = [...list.items];
                const current = items[index];
                const previous = items[index - 1];
                if (!current || !previous) return;
                items[index - 1] = current;
                items[index] = previous;
                update({ items });
              }}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move item ${index + 1} down`}
              className="button button-ghost button-small"
              disabled={index === list.items.length - 1}
              onClick={() => {
                const items = [...list.items];
                const current = items[index];
                const next = items[index + 1];
                if (!current || !next) return;
                items[index] = next;
                items[index + 1] = current;
                update({ items });
              }}
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={`Remove item ${index + 1}`}
              className="button button-danger button-small"
              disabled={list.items.length <= 1}
              onClick={() =>
                update({ items: list.items.filter((current) => current.id !== item.id) })
              }
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function navigationItemId(): string {
  return newBuilderUuid();
}

type NavigationActionType = NonNullable<NavigationItem['action']>['type'];
type NavigationDraftField = 'label' | 'externalUrl' | 'actionValue';

function navigationDraftKey(itemId: string, field: NavigationDraftField): string {
  return `${itemId}:${field}`;
}

function defaultNavigationActionValue(type: NavigationActionType): string {
  if (type === 'phone') return '+10000000000';
  if (type === 'email') return 'hello@example.com';
  return 'https://example.com';
}

function pagesForNavigationType(
  type: NavigationItem['type'],
  pages: readonly Pick<Page, 'id' | 'name' | 'path' | 'anchors'>[],
) {
  const routablePages = pages.filter((page) => Boolean(page.path));
  return type === 'section'
    ? routablePages.filter((page) => (page.anchors ?? []).length > 0)
    : routablePages;
}

function newNavigationItem(
  type: NavigationItem['type'] = 'external',
  pages: readonly Pick<Page, 'id' | 'name' | 'path' | 'anchors'>[] = [],
): NavigationItem | null {
  const base = { id: navigationItemId(), label: 'New item' };
  if (type === 'external') return { ...base, type, externalUrl: 'https://example.com' };
  const page = pagesForNavigationType(type, pages)[0];
  if (!page) return null;
  if (type === 'page') return { ...base, type, pageId: page.id };
  if (type === 'section')
    return {
      ...base,
      type,
      pageId: page.id,
      anchorId: page.anchors?.[0]!,
    };
  return {
    ...base,
    type,
    action: { type: 'custom', value: defaultNavigationActionValue('custom') },
  };
}

function navigationDraftError(
  item: NavigationItem,
  field: NavigationDraftField,
  raw: string,
): string | undefined {
  const candidate: NavigationItem =
    field === 'label'
      ? { ...item, label: raw }
      : field === 'externalUrl'
        ? { ...item, externalUrl: raw }
        : {
            ...item,
            action: {
              type: item.action?.type ?? 'custom',
              value: raw,
            },
          };
  const parsed = NavigationItemSchema.safeParse(candidate);
  if (parsed.success) return undefined;
  const expectedPath = field === 'actionValue' ? 'value' : field;
  return (
    parsed.error.issues.find((issue) => issue.path.at(-1) === expectedPath)?.message ??
    'Enter a valid value.'
  );
}

function navigationItemLocation(
  items: readonly NavigationItem[],
  id: string,
  depth = 0,
): {
  depth: number;
  index: number;
  previous?: NavigationItem;
  siblingCount: number;
} | null {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    return {
      depth,
      index,
      ...(items[index - 1] ? { previous: items[index - 1] } : {}),
      siblingCount: items.length,
    };
  }
  for (const item of items) {
    if (!item.children) continue;
    const nested = navigationItemLocation(item.children, id, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function NavigationTreeEditor({
  navigationPages = [],
  value,
  onChange,
}: CustomPropertyEditorProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [treeError, setTreeError] = useState<string | undefined>();
  const itemsRef = useRef<NavigationItem[]>([]);
  const parsed = NavigationViewPropsSchema.safeParse(value);
  if (!parsed.success) return null;
  const props = parsed.data;
  const items = props.items ?? [];
  itemsRef.current = items;
  const ownedProps = { ...props };
  delete ownedProps.source;
  const updateItems = (next: readonly NavigationItem[]): boolean => {
    const nextParsed = NavigationItemsSchema.safeParse(next);
    if (!nextParsed.success) {
      setTreeError(
        'This menu item change is not valid. Check the item fields and try again.',
      );
      return false;
    }
    const limits = validateNavigationItems(nextParsed.data);
    if (!limits.valid) {
      setTreeError(
        limits.reason === 'node-limit'
          ? 'This menu has reached its supported item limit.'
          : 'This menu is too large to save. Remove some items and try again.',
      );
      return false;
    }
    if (JSON.stringify(nextParsed.data) === JSON.stringify(itemsRef.current))
      return false;
    setTreeError(undefined);
    itemsRef.current = nextParsed.data;
    onChange({ ...ownedProps, items: nextParsed.data });
    return true;
  };
  const clearDraft = (itemId: string, field?: NavigationDraftField) => {
    setDrafts((current) => {
      const next = { ...current };
      if (field) {
        delete next[navigationDraftKey(itemId, field)];
      } else {
        (['label', 'externalUrl', 'actionValue'] as const).forEach((draftField) => {
          delete next[navigationDraftKey(itemId, draftField)];
        });
      }
      return next;
    });
    setDraftErrors((current) => {
      const next = { ...current };
      if (field) {
        delete next[navigationDraftKey(itemId, field)];
      } else {
        (['label', 'externalUrl', 'actionValue'] as const).forEach((draftField) => {
          delete next[navigationDraftKey(itemId, draftField)];
        });
      }
      return next;
    });
  };
  const updateDraft = (
    itemId: string,
    field: NavigationDraftField,
    raw: string,
    update: (item: NavigationItem) => NavigationItem,
  ) => {
    const current = findNavigationItem(itemsRef.current, itemId);
    if (!current) return;
    const error = navigationDraftError(current, field, raw);
    setDrafts((current) => ({
      ...current,
      [navigationDraftKey(itemId, field)]: raw,
    }));
    if (error) {
      setDraftErrors((current) => ({
        ...current,
        [navigationDraftKey(itemId, field)]: error,
      }));
      return;
    }
    const next = updateNavigationItem(itemsRef.current, itemId, update);
    if (updateItems(next)) clearDraft(itemId, field);
  };
  const commitDraft = (
    itemId: string,
    field: NavigationDraftField,
    raw: string,
    update: (item: NavigationItem) => NavigationItem,
  ) => {
    const current = findNavigationItem(itemsRef.current, itemId);
    if (!current) return;
    const error = navigationDraftError(current, field, raw);
    if (error) {
      setDrafts((draft) => ({
        ...draft,
        [navigationDraftKey(itemId, field)]: raw,
      }));
      setDraftErrors((draft) => ({
        ...draft,
        [navigationDraftKey(itemId, field)]: error,
      }));
      return;
    }
    const next = updateNavigationItem(itemsRef.current, itemId, update);
    if (JSON.stringify(next) !== JSON.stringify(itemsRef.current)) updateItems(next);
    clearDraft(itemId, field);
  };
  const canDuplicate = (itemId: string): boolean => {
    const visit = (
      siblings: readonly NavigationItem[],
      limit: number,
    ): boolean | null => {
      if (siblings.some((item) => item.id === itemId)) return siblings.length < limit;
      for (const item of siblings) {
        if (item.children) {
          const result = visit(item.children, 50);
          if (result !== null) return result;
        }
      }
      return null;
    };
    return visit(itemsRef.current, 100) ?? false;
  };
  const renderItems = (nodes: readonly NavigationItem[], depth = 0): ReactNode[] =>
    nodes.flatMap((item) => {
      const pageOptions = pagesForNavigationType(item.type, navigationPages);
      const sectionAnchors =
        navigationPages.find((page) => page.id === item.pageId)?.anchors ?? [];
      const labelDraft = navigationDraftKey(item.id, 'label');
      const externalUrlDraft = navigationDraftKey(item.id, 'externalUrl');
      const actionValueDraft = navigationDraftKey(item.id, 'actionValue');
      const nextItemLabel = drafts[labelDraft] ?? item.label;
      const actionValue = drafts[actionValueDraft] ?? item.action?.value ?? '';
      const location = navigationItemLocation(itemsRef.current, item.id);
      return [
        <div
          className="builder-navigation-item"
          key={item.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const sourceId = event.dataTransfer.getData('text/navigation-item');
            if (sourceId)
              updateItems(moveNavigationItemTo(itemsRef.current, sourceId, item.id));
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              updateItems(moveNavigationItem(itemsRef.current, item.id, -1));
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              updateItems(moveNavigationItem(itemsRef.current, item.id, 1));
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              updateItems(indentNavigationItem(itemsRef.current, item.id));
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              updateItems(outdentNavigationItem(itemsRef.current, item.id));
            }
          }}
          role="treeitem"
          style={{ marginLeft: depth * 12 }}
          tabIndex={0}
        >
          <button
            aria-label={`Drag ${item.label}`}
            className="builder-navigation-drag-handle"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/navigation-item', item.id);
            }}
            type="button"
          >
            ☰
          </button>
          <TextField
            aria-invalid={draftErrors[labelDraft] ? true : undefined}
            compact
            error={draftErrors[labelDraft]}
            label="Label"
            onBlur={(event) => {
              const raw = event.currentTarget.value;
              commitDraft(item.id, 'label', raw, (current) => ({
                ...current,
                label: raw,
              }));
            }}
            onChange={(event) => {
              const raw = event.target.value;
              updateDraft(item.id, 'label', raw, (current) => ({
                ...current,
                label: raw,
              }));
            }}
            value={nextItemLabel}
          />
          <SelectField
            compact
            label="Target type"
            onChange={(event) => {
              const nextType = event.target.value as NavigationItem['type'];
              const nextItem = newNavigationItem(nextType, navigationPages);
              if (!nextItem) return;
              if (
                updateItems(
                  updateNavigationItem(itemsRef.current, item.id, (current) => ({
                    ...nextItem,
                    id: current.id,
                    label: drafts[labelDraft]?.trim()
                      ? drafts[labelDraft]
                      : current.label,
                    ...(current.children ? { children: current.children } : {}),
                    ...(current.openInNewTab !== undefined
                      ? { openInNewTab: current.openInNewTab }
                      : {}),
                  })),
                )
              ) {
                clearDraft(item.id);
              }
            }}
            value={item.type}
          >
            <option disabled={navigationPages.length === 0} value="page">
              Page
            </option>
            <option
              disabled={pagesForNavigationType('section', navigationPages).length === 0}
              value="section"
            >
              Section
            </option>
            <option value="external">External URL</option>
            <option value="action">Action</option>
          </SelectField>
          {item.type === 'page' || item.type === 'section' ? (
            <>
              <SelectField
                compact
                label="Page"
                onChange={(event) => {
                  const page = pageOptions.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (!page || (item.type === 'section' && !page.anchors?.[0])) return;
                  updateItems(
                    updateNavigationItem(itemsRef.current, item.id, (current) => ({
                      ...current,
                      pageId: event.target.value,
                      ...(current.type === 'section'
                        ? { anchorId: page.anchors?.[0]! }
                        : {}),
                    })),
                  );
                }}
                disabled={pageOptions.length === 0}
                value={item.pageId ?? ''}
              >
                <option disabled value="">
                  Choose a page
                </option>
                {pageOptions.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                    {page.path ? ` · ${page.path}` : ''}
                  </option>
                ))}
              </SelectField>
              {item.type === 'section' ? (
                <SelectField
                  compact
                  disabled={sectionAnchors.length === 0}
                  label="Section"
                  onChange={(event) => {
                    if (!event.target.value) return;
                    updateItems(
                      updateNavigationItem(itemsRef.current, item.id, (current) => ({
                        ...current,
                        anchorId: event.target.value,
                      })),
                    );
                  }}
                  value={item.anchorId ?? ''}
                >
                  <option disabled value="">
                    Choose a section
                  </option>
                  {sectionAnchors.map((anchor) => (
                    <option key={anchor} value={anchor}>
                      {anchor}
                    </option>
                  ))}
                </SelectField>
              ) : null}
            </>
          ) : null}
          {item.type === 'external' ? (
            <TextField
              aria-invalid={draftErrors[externalUrlDraft] ? true : undefined}
              compact
              error={draftErrors[externalUrlDraft]}
              label="URL"
              onBlur={(event) => {
                const raw = event.currentTarget.value;
                commitDraft(item.id, 'externalUrl', raw, (current) => ({
                  ...current,
                  externalUrl: raw,
                }));
              }}
              onChange={(event) => {
                const raw = event.target.value;
                updateDraft(item.id, 'externalUrl', raw, (current) => ({
                  ...current,
                  externalUrl: raw,
                }));
              }}
              value={drafts[externalUrlDraft] ?? item.externalUrl ?? ''}
            />
          ) : null}
          {item.type === 'action' ? (
            <>
              <SelectField
                compact
                label="Action"
                onChange={(event) => {
                  const type = event.target.value as NavigationActionType;
                  updateItems(
                    updateNavigationItem(itemsRef.current, item.id, (current) => ({
                      ...current,
                      action: { type, value: defaultNavigationActionValue(type) },
                    })),
                  );
                  clearDraft(item.id, 'actionValue');
                }}
                value={item.action?.type ?? 'custom'}
              >
                <option value="phone">Phone</option>
                <option value="email">Email</option>
                <option value="download">Download</option>
                <option value="custom">Custom</option>
              </SelectField>
              <TextField
                aria-invalid={draftErrors[actionValueDraft] ? true : undefined}
                compact
                error={draftErrors[actionValueDraft]}
                label="Value"
                onBlur={(event) => {
                  const raw = event.currentTarget.value;
                  commitDraft(item.id, 'actionValue', raw, (current) => ({
                    ...current,
                    action: {
                      type: current.action?.type ?? 'custom',
                      value: raw,
                    },
                  }));
                }}
                onChange={(event) => {
                  const raw = event.target.value;
                  updateDraft(item.id, 'actionValue', raw, (current) => ({
                    ...current,
                    action: {
                      type: current.action?.type ?? 'custom',
                      value: raw,
                    },
                  }));
                }}
                value={actionValue}
              />
            </>
          ) : null}
          <SelectField
            compact
            label="Open in"
            onChange={(event) =>
              updateItems(
                updateNavigationItem(itemsRef.current, item.id, (current) => ({
                  ...current,
                  openInNewTab: event.target.value === '_blank',
                })),
              )
            }
            value={item.openInNewTab ? '_blank' : '_self'}
          >
            <option value="_self">Same tab</option>
            <option value="_blank">New tab</option>
          </SelectField>
          <div className="row-actions">
            <button
              aria-label={`Add child to ${item.label}`}
              className="button button-small button-ghost"
              disabled={(item.children?.length ?? 0) >= 50}
              onClick={() => {
                const child = newNavigationItem('external', navigationPages);
                if (!child) return;
                updateItems(
                  updateNavigationItem(itemsRef.current, item.id, (current) => ({
                    ...current,
                    children: [...(current.children ?? []), child],
                  })),
                );
              }}
              type="button"
            >
              + Child
            </button>
            <button
              aria-label={`Move ${item.label} up`}
              className="button button-small button-ghost"
              disabled={!location || location.index === 0}
              onClick={() =>
                updateItems(moveNavigationItem(itemsRef.current, item.id, -1))
              }
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${item.label} down`}
              className="button button-small button-ghost"
              disabled={!location || location.index >= location.siblingCount - 1}
              onClick={() =>
                updateItems(moveNavigationItem(itemsRef.current, item.id, 1))
              }
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={`Indent ${item.label}`}
              className="button button-small button-ghost"
              disabled={
                !location ||
                location.index === 0 ||
                (location.previous?.children?.length ?? 0) >= 50
              }
              onClick={() => updateItems(indentNavigationItem(itemsRef.current, item.id))}
              type="button"
            >
              →
            </button>
            <button
              aria-label={`Outdent ${item.label}`}
              className="button button-small button-ghost"
              disabled={!location || location.depth === 0}
              onClick={() =>
                updateItems(outdentNavigationItem(itemsRef.current, item.id))
              }
              type="button"
            >
              ←
            </button>
            <button
              className="button button-small button-ghost"
              disabled={!canDuplicate(item.id)}
              onClick={() =>
                updateItems(duplicateNavigationItem(itemsRef.current, item.id))
              }
              type="button"
            >
              Duplicate
            </button>
            <button
              className="button button-small button-danger"
              onClick={() => {
                if (updateItems(removeNavigationItem(itemsRef.current, item.id))) {
                  clearDraft(item.id);
                }
              }}
              type="button"
            >
              Remove
            </button>
          </div>
        </div>,
        ...(item.children ? renderItems(item.children, depth + 1) : []),
      ];
    });
  return (
    <div className="builder-navigation-editor">
      {treeError ? (
        <p className="ui-field-error builder-navigation-editor-error" role="alert">
          {treeError}
        </p>
      ) : null}
      <div className="builder-property-control">
        <span className="builder-property-label">Menu items</span>
        <button
          className="button button-secondary button-small"
          disabled={items.length >= 100}
          onClick={() => {
            const item = newNavigationItem('external', navigationPages);
            if (item) updateItems([...itemsRef.current, item]);
          }}
          type="button"
        >
          + Add item
        </button>
      </div>
      {items.length ? (
        renderItems(items)
      ) : (
        <p className="muted small">
          Add items to own this menu in the Builder. The legacy site source is available
          until then.
        </p>
      )}
    </div>
  );
}

function formFieldType(field: FormField): FormField['type'] {
  return field.type;
}

export function FormPropertyEditor({ value, onChange }: CustomPropertyEditorProps) {
  const parsed = FormPropsSchema.safeParse(value);
  if (!parsed.success) return null;
  const form = parsed.data;

  function update(patch: Partial<FormProps>) {
    onChange({ ...form, ...patch });
  }

  function patchField(index: number, patch: Record<string, unknown>) {
    update({
      fields: form.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      ),
    });
  }

  function changeType(index: number, type: FormField['type']) {
    const field = form.fields[index];
    if (!field) return;
    const next: Record<string, unknown> = {
      id: field.id,
      label: field.label,
      name: field.name,
      required: field.required,
      type,
    };
    if (type !== 'checkbox' && type !== 'radio') next.placeholder = 'Optional';
    if (type === 'select' || type === 'radio') {
      next.options = [{ value: 'option', label: 'Option' }];
    }
    patchField(index, next);
  }

  return (
    <div className="builder-form-editor">
      <TextField
        compact
        label="Submit button label"
        onChange={(event) => update({ submitLabel: event.target.value })}
        value={form.submitLabel}
      />
      <TextAreaField
        compact
        label="Success message"
        onChange={(event) => update({ successMessage: event.target.value })}
        rows={3}
        value={form.successMessage}
      />
      <div className="builder-property-control">
        <span className="builder-property-label">Fields</span>
        <button
          className="button button-secondary button-small"
          disabled={form.fields.length >= 20}
          onClick={() => {
            const id = newFieldId();
            update({
              fields: [
                ...form.fields,
                {
                  id,
                  type: 'text',
                  label: 'New field',
                  name: id,
                  required: false,
                  placeholder: '',
                },
              ],
            });
          }}
          type="button"
        >
          + Add field
        </button>
      </div>
      {form.fields.map((field, index) => (
        <fieldset className="builder-form-field" key={field.id}>
          <legend>
            {index + 1}. {field.label}
          </legend>
          <TextField
            compact
            aria-label={`Form field label ${field.id}`}
            label="Label"
            onChange={(event) => patchField(index, { label: event.target.value })}
            value={field.label}
          />
          <SelectField
            aria-label={`Form field type ${field.id}`}
            compact
            label="Type"
            onChange={(event) =>
              changeType(index, event.target.value as FormField['type'])
            }
            value={formFieldType(field)}
          >
            {['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'radio'].map(
              (type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ),
            )}
          </SelectField>
          {'placeholder' in field ? (
            <TextField
              compact
              label="Placeholder"
              onChange={(event) => patchField(index, { placeholder: event.target.value })}
              value={field.placeholder ?? ''}
            />
          ) : null}
          <label className="checkbox-field">
            <input
              checked={field.required}
              onChange={(event) => patchField(index, { required: event.target.checked })}
              type="checkbox"
            />
            Required
          </label>
          {'options' in field ? (
            <div className="builder-form-options">
              {field.options.map((option, optionIndex) => (
                <TextField
                  compact
                  key={`${field.id}-${optionIndex}`}
                  label={`Option ${optionIndex + 1}`}
                  onChange={(event) =>
                    patchField(index, {
                      options: field.options.map((current, currentIndex) =>
                        currentIndex === optionIndex
                          ? { ...current, label: event.target.value }
                          : current,
                      ),
                    })
                  }
                  value={option.label}
                />
              ))}
            </div>
          ) : null}
          <div className="row-actions">
            <button
              aria-label={`Move field ${index + 1} up`}
              className="button button-ghost button-small"
              disabled={index === 0}
              onClick={() => {
                const fields = [...form.fields];
                const current = fields[index];
                const previous = fields[index - 1];
                if (!current || !previous) return;
                fields[index - 1] = current;
                fields[index] = previous;
                update({ fields });
              }}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move field ${index + 1} down`}
              className="button button-ghost button-small"
              disabled={index === form.fields.length - 1}
              onClick={() => {
                const fields = [...form.fields];
                const current = fields[index];
                const next = fields[index + 1];
                if (!current || !next) return;
                fields[index] = next;
                fields[index + 1] = current;
                update({ fields });
              }}
              type="button"
            >
              ↓
            </button>
            <button
              className="button button-danger button-small"
              disabled={form.fields.length <= 1}
              onClick={() =>
                update({ fields: form.fields.filter((_, i) => i !== index) })
              }
              type="button"
            >
              Remove
            </button>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export const CUSTOM_PROPERTY_EDITORS = {
  form: FormPropertyEditor,
  list: ListPropertyEditor,
  navigation: NavigationTreeEditor,
} as const;
