'use client';

import type { Page, Navigation, NavigationItem, Site } from '@payload/contracts';
import { useEffect, useMemo, useState } from 'react';

type NavigationItemKind = NavigationItem['type'];

function createItemId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0')}`;
}

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
  const current = navigations.find((navigation) => navigation.key === selectedKey);
  const selectedPage = pages.find((page) => page.id === itemPageId);
  const anchors = useMemo(() => selectedPage?.anchors ?? [], [selectedPage]);

  useEffect(() => {
    setName(
      current?.name ??
        (selectedKey === 'footer' ? 'Footer navigation' : 'Main navigation'),
    );
    setItems(current?.items ?? []);
  }, [current, selectedKey]);

  function addItem() {
    const label = itemLabel.trim();
    if (!label) return;
    let item: NavigationItem;
    if (itemKind === 'page') {
      if (!itemPageId) return;
      item = { id: createItemId(), label, type: 'page', pageId: itemPageId };
    } else if (itemKind === 'section') {
      if (!itemPageId || !itemAnchorId.trim()) return;
      item = {
        id: createItemId(),
        label,
        type: 'section',
        pageId: itemPageId,
        anchorId: itemAnchorId.trim(),
      };
    } else if (itemKind === 'external') {
      if (!itemExternalUrl.trim()) return;
      item = {
        id: createItemId(),
        label,
        type: 'external',
        externalUrl: itemExternalUrl.trim(),
        openInNewTab: true,
      };
    } else {
      if (!itemActionValue.trim()) return;
      item = {
        id: createItemId(),
        label,
        type: 'action',
        action: { type: itemActionType, value: itemActionValue.trim() },
      };
    }
    setItems((currentItems) => [...currentItems, item]);
    setItemLabel('');
    setItemAnchorId('');
    setItemExternalUrl('');
    setItemActionValue('');
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
                <strong>Add item</strong>
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
                <button
                  className="button button-secondary button-small"
                  onClick={addItem}
                  type="button"
                >
                  Add item
                </button>
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
          <PanelTitle title="Menu items" count={items.length} />
          {items.length ? (
            <div className="list">
              {items.map((item, index) => (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <span className="muted small">
                      {item.type}
                      {item.type === 'page' || item.type === 'section'
                        ? ` · ${pages.find((page) => page.id === item.pageId)?.path ?? 'missing page'}`
                        : ''}
                    </span>
                  </div>
                  {canUpdate ? (
                    <div className="row-actions">
                      <button
                        className="button button-ghost button-small"
                        disabled={index === 0}
                        onClick={() =>
                          setItems((currentItems) => moveItem(currentItems, index, -1))
                        }
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        className="button button-ghost button-small"
                        disabled={index === items.length - 1}
                        onClick={() =>
                          setItems((currentItems) => moveItem(currentItems, index, 1))
                        }
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="button button-ghost button-small"
                        onClick={() =>
                          setItems((currentItems) =>
                            currentItems.filter((candidate) => candidate.id !== item.id),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
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

function moveItem(
  items: NavigationItem[],
  index: number,
  offset: -1 | 1,
): NavigationItem[] {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item) next.splice(nextIndex, 0, item);
  return next;
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
