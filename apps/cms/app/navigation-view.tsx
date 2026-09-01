'use client';

import type { Page, Navigation, NavigationItem, Site } from '@payload/contracts';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createNavigationItemId,
  duplicateNavigationItem,
  findNavigationItem,
  flattenNavigationItems,
  indentNavigationItem,
  moveNavigationItem,
  outdentNavigationItem,
  removeNavigationItem,
  updateNavigationItem,
} from './navigation-tree';

type NavigationItemKind = NavigationItem['type'];

export function NavigationView({
  sites,
  pages,
  selectedSiteId,
  navigations,
  busy,
  canUpdate,
  onSelectSite,
  onSave,
  onRemove,
}: {
  sites: Site[];
  pages: Page[];
  selectedSiteId: string;
  navigations: Navigation[];
  busy: boolean;
  canUpdate: boolean;
  onSelectSite: (siteId: string) => void;
  onSave: (input: {
    id?: string;
    key: string;
    name: string;
    items: NavigationItem[];
  }) => void;
  onRemove: (navigation: Navigation) => void;
}) {
  const [selectedKey, setSelectedKey] = useState('main');
  const [name, setName] = useState('Main navigation');
  const [items, setItems] = useState<NavigationItem[]>([]);
  const [itemKind, setItemKind] = useState<NavigationItemKind>('page');
  const [itemLabel, setItemLabel] = useState('');
  const [itemPageId, setItemPageId] = useState('');
  const [itemAnchorId, setItemAnchorId] = useState('');
  const [itemExternalUrl, setItemExternalUrl] = useState('');
  const [itemActionType, setItemActionType] = useState<
    'phone' | 'email' | 'download' | 'custom'
  >('phone');
  const [itemActionValue, setItemActionValue] = useState('');
  const [itemOpenInNewTab, setItemOpenInNewTab] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [parentItemId, setParentItemId] = useState<string | null>(null);
  const current = navigations.find((navigation) => navigation.key === selectedKey);
  const selectedPage = pages.find((page) => page.id === itemPageId);
  const anchors = useMemo(() => selectedPage?.anchors ?? [], [selectedPage]);

  useEffect(() => {
    setName(
      current?.name ??
        (selectedKey === 'footer' ? 'Footer navigation' : 'Main navigation'),
    );
    setItems(current?.draftItems ?? current?.items ?? []);
    setEditingItemId(null);
    setParentItemId(null);
  }, [current, selectedKey]);

  function resetItemForm() {
    setEditingItemId(null);
    setParentItemId(null);
    setItemLabel('');
    setItemPageId('');
    setItemAnchorId('');
    setItemExternalUrl('');
    setItemActionValue('');
    setItemOpenInNewTab(false);
  }

  function saveItem() {
    const label = itemLabel.trim();
    if (!label) return;
    let item: NavigationItem;
    if (itemKind === 'page') {
      if (!itemPageId) return;
      item = {
        id: editingItemId ?? createNavigationItemId(),
        label,
        type: 'page',
        pageId: itemPageId,
        ...(itemOpenInNewTab ? { openInNewTab: true } : {}),
      };
    } else if (itemKind === 'section') {
      if (!itemPageId || !itemAnchorId.trim()) return;
      item = {
        id: editingItemId ?? createNavigationItemId(),
        label,
        type: 'section',
        pageId: itemPageId,
        anchorId: itemAnchorId.trim(),
        ...(itemOpenInNewTab ? { openInNewTab: true } : {}),
      };
    } else if (itemKind === 'external') {
      if (!itemExternalUrl.trim()) return;
      item = {
        id: editingItemId ?? createNavigationItemId(),
        label,
        type: 'external',
        externalUrl: itemExternalUrl.trim(),
        ...(itemOpenInNewTab ? { openInNewTab: true } : {}),
      };
    } else {
      if (!itemActionValue.trim()) return;
      item = {
        id: editingItemId ?? createNavigationItemId(),
        label,
        type: 'action',
        action: { type: itemActionType, value: itemActionValue.trim() },
        ...(itemOpenInNewTab ? { openInNewTab: true } : {}),
      };
    }
    setItems((currentItems) => {
      if (editingItemId) {
        return updateNavigationItem(currentItems, editingItemId, (currentItem) => ({
          ...item,
          ...(currentItem.children ? { children: currentItem.children } : {}),
        }));
      }
      if (parentItemId) {
        return updateNavigationItem(currentItems, parentItemId, (parent) => ({
          ...parent,
          children: [...(parent.children ?? []), item],
        }));
      }
      return [...currentItems, item];
    });
    resetItemForm();
  }

  function editItem(item: NavigationItem) {
    setEditingItemId(item.id);
    setParentItemId(null);
    setItemKind(item.type);
    setItemLabel(item.label);
    setItemPageId(
      item.type === 'page' || item.type === 'section' ? (item.pageId ?? '') : '',
    );
    setItemAnchorId(item.type === 'section' ? (item.anchorId ?? '') : '');
    setItemExternalUrl(item.type === 'external' ? (item.externalUrl ?? '') : '');
    setItemActionType(item.type === 'action' ? (item.action?.type ?? 'phone') : 'phone');
    setItemActionValue(item.type === 'action' ? (item.action?.value ?? '') : '');
    setItemOpenInNewTab(item.openInNewTab ?? false);
  }

  function addChild(parentId: string) {
    resetItemForm();
    setParentItemId(parentId);
  }

  function renderItems(itemsToRender: NavigationItem[], depth = 0): ReactNode {
    return itemsToRender.map((item, index) => (
      <div
        className="list-row navigation-tree-row"
        data-navigation-item-id={item.id}
        key={item.id}
        role="treeitem"
        style={{ marginInlineStart: `${depth * 1.25}rem` }}
      >
        <div>
          <strong>
            {depth > 0 ? '↳ ' : ''}
            {item.label}
          </strong>
          <span className="muted small">
            {item.type}
            {item.type === 'page' || item.type === 'section'
              ? ` · ${pages.find((page) => page.id === item.pageId)?.path ?? 'missing page'}`
              : ''}
            {item.type === 'page' || item.type === 'section' ? (
              <NavigationTargetStatus item={item} pages={pages} />
            ) : null}
            {item.children?.length
              ? ` · ${item.children.length} child${item.children.length === 1 ? '' : 'ren'}`
              : ''}
          </span>
        </div>
        {canUpdate ? (
          <div className="row-actions">
            <button
              aria-label={`Edit ${item.label}`}
              className="button button-ghost button-small"
              onClick={() => editItem(item)}
              type="button"
            >
              Edit
            </button>
            <button
              aria-label={`Add child to ${item.label}`}
              className="button button-ghost button-small"
              onClick={() => addChild(item.id)}
              type="button"
            >
              + Child
            </button>
            <button
              aria-label={`Move ${item.label} up`}
              className="button button-ghost button-small"
              disabled={index === 0}
              onClick={() =>
                setItems((currentItems) => moveNavigationItem(currentItems, item.id, -1))
              }
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${item.label} down`}
              className="button button-ghost button-small"
              disabled={index === itemsToRender.length - 1}
              onClick={() =>
                setItems((currentItems) => moveNavigationItem(currentItems, item.id, 1))
              }
              type="button"
            >
              ↓
            </button>
            <button
              aria-label={`Indent ${item.label}`}
              className="button button-ghost button-small"
              disabled={index === 0}
              onClick={() =>
                setItems((currentItems) => indentNavigationItem(currentItems, item.id))
              }
              type="button"
            >
              →
            </button>
            <button
              aria-label={`Outdent ${item.label}`}
              className="button button-ghost button-small"
              disabled={depth === 0}
              onClick={() =>
                setItems((currentItems) => outdentNavigationItem(currentItems, item.id))
              }
              type="button"
            >
              ←
            </button>
            <button
              aria-label={`Duplicate ${item.label}`}
              className="button button-ghost button-small"
              onClick={() =>
                setItems((currentItems) => duplicateNavigationItem(currentItems, item.id))
              }
              type="button"
            >
              Duplicate
            </button>
            <button
              aria-label={`Remove ${item.label}`}
              className="button button-ghost button-small"
              onClick={() =>
                setItems((currentItems) => removeNavigationItem(currentItems, item.id))
              }
              type="button"
            >
              Remove
            </button>
          </div>
        ) : null}
        {item.children?.length ? (
          <div className="navigation-tree-children">
            {renderItems(item.children, depth + 1)}
          </div>
        ) : null}
      </div>
    ));
  }

  if (!selectedSiteId) {
    return (
      <>
        <PageHeading
          title="Navigation"
          description="Choose a site to manage its structured menus."
        />
        <div className="panel">
          <EmptyState
            title="Select a site first"
            description="Navigation belongs to a site."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Content"
        title="Navigation"
        description="Build site-owned menus from pages, sections, external links and safe actions."
      />
      <div className="toolbar">
        <label className="inline-field">
          Site
          <select
            aria-label="Navigation site"
            onChange={(event) => onSelectSite(event.target.value)}
            value={selectedSiteId}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Menu
          <select
            aria-label="Navigation menu"
            onChange={(event) => setSelectedKey(event.target.value)}
            value={selectedKey}
          >
            <option value="main">Main navigation</option>
            <option value="footer">Footer navigation</option>
          </select>
        </label>
      </div>
      <div className="two-column">
        <section className="panel">
          <PanelTitle title={current ? 'Edit menu' : 'Create menu'} />
          {canUpdate ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                onSave({
                  ...(current ? { id: current.id } : {}),
                  key: selectedKey,
                  name: name.trim(),
                  items,
                });
              }}
            >
              <label>
                Menu name
                <input
                  aria-label="Menu name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <div className="panel inset-panel">
                <strong>
                  {editingItemId
                    ? 'Edit item'
                    : parentItemId
                      ? 'Add child item'
                      : 'Add item'}
                </strong>
                {parentItemId ? (
                  <p className="muted small">
                    Child of{' '}
                    {findNavigationItem(items, parentItemId)?.label ?? 'selected item'}
                  </p>
                ) : null}
                <label>
                  Type
                  <select
                    aria-label="Navigation item type"
                    onChange={(event) =>
                      setItemKind(event.target.value as NavigationItemKind)
                    }
                    value={itemKind}
                  >
                    <option value="page">Page</option>
                    <option value="section">Page section</option>
                    <option value="external">External link</option>
                    <option value="action">Action</option>
                  </select>
                </label>
                <label>
                  Label
                  <input
                    aria-label="Navigation item label"
                    onChange={(event) => setItemLabel(event.target.value)}
                    value={itemLabel}
                  />
                </label>
                {itemKind === 'page' || itemKind === 'section' ? (
                  <label>
                    Page
                    <select
                      aria-label="Navigation item page"
                      onChange={(event) => setItemPageId(event.target.value)}
                      value={itemPageId}
                    >
                      <option value="">Choose a page</option>
                      {pages.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.name} · {page.path}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {itemKind === 'section' ? (
                  <label>
                    Anchor
                    <input
                      aria-label="Navigation item anchor"
                      list="navigation-anchors"
                      onChange={(event) => setItemAnchorId(event.target.value)}
                      placeholder="features"
                      value={itemAnchorId}
                    />
                    <datalist id="navigation-anchors">
                      {anchors.map((anchor) => (
                        <option key={anchor} value={anchor} />
                      ))}
                    </datalist>
                  </label>
                ) : null}
                {itemKind === 'external' ? (
                  <label>
                    HTTPS URL
                    <input
                      aria-label="Navigation external URL"
                      onChange={(event) => setItemExternalUrl(event.target.value)}
                      placeholder="https://example.com"
                      type="url"
                      value={itemExternalUrl}
                    />
                  </label>
                ) : null}
                {itemKind === 'action' ? (
                  <>
                    <label>
                      Action
                      <select
                        aria-label="Navigation action type"
                        onChange={(event) =>
                          setItemActionType(event.target.value as typeof itemActionType)
                        }
                        value={itemActionType}
                      >
                        <option value="phone">Phone</option>
                        <option value="email">Email</option>
                        <option value="download">Download</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label>
                      Value
                      <input
                        aria-label="Navigation action value"
                        onChange={(event) => setItemActionValue(event.target.value)}
                        value={itemActionValue}
                      />
                    </label>
                  </>
                ) : null}
                <label className="checkbox-field">
                  <input
                    checked={itemOpenInNewTab}
                    onChange={(event) => setItemOpenInNewTab(event.target.checked)}
                    type="checkbox"
                  />
                  Open in a new tab
                </label>
                <button
                  className="button button-secondary button-small"
                  onClick={saveItem}
                  type="button"
                >
                  {editingItemId ? 'Update item' : 'Add item'}
                </button>
                {editingItemId || parentItemId ? (
                  <button
                    className="button button-ghost button-small"
                    onClick={resetItemForm}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              <button
                className="button button-primary"
                disabled={busy || !name.trim()}
                type="submit"
              >
                {busy ? 'Saving…' : 'Save navigation'}
              </button>
            </form>
          ) : (
            <p className="muted">You have read-only access to navigation.</p>
          )}
        </section>
        <section className="panel">
          <PanelTitle title="Menu items" count={flattenNavigationItems(items).length} />
          {current?.hasUnpublishedChanges ? (
            <p className="notice notice-warning">
              Unpublished navigation changes. Save updates Preview; Publish Site updates
              the live structure.
            </p>
          ) : null}
          {items.length ? (
            <div aria-label="Navigation item tree" className="list" role="tree">
              {renderItems(items)}
            </div>
          ) : (
            <EmptyState
              title="No menu items"
              description="Add a page or link, then save the menu."
            />
          )}
          {current && canUpdate ? (
            <button
              className="button button-ghost button-small"
              onClick={() => onRemove(current)}
              type="button"
            >
              Delete menu
            </button>
          ) : null}
        </section>
      </div>
    </>
  );
}

function NavigationTargetStatus({
  item,
  pages,
}: {
  item: NavigationItem;
  pages: Page[];
}) {
  if (item.type !== 'page' && item.type !== 'section') return null;
  const page = pages.find((candidate) => candidate.id === item.pageId);
  if (!page) {
    return <span className="navigation-target-status is-error"> · ⚠ Missing target</span>;
  }
  if (!page.publishedVersionId) {
    return (
      <span className="navigation-target-status is-warning">
        {' · ○ Draft — hidden from live site until published'}
      </span>
    );
  }
  if (
    item.type === 'section' &&
    item.anchorId &&
    page.anchors &&
    !page.anchors.includes(item.anchorId)
  ) {
    return (
      <span className="navigation-target-status is-error">
        {' · ⚠ Anchor missing in current draft'}
      </span>
    );
  }
  return <span className="navigation-target-status is-success"> · ● Live</span>;
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h1>{title}</h1>
      <p className="muted">{description}</p>
    </header>
  );
}
function PanelTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {count === undefined ? null : <span className="pill">{count}</span>}
    </div>
  );
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span className="muted">{description}</span>
    </div>
  );
}
