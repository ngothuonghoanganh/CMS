'use client';

import {
  type Collection,
  type CollectionEntryResponse,
  type CollectionFieldType,
  type Site,
} from '@payload/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { api } from './lib/api';
import { Drawer, Modal, PageHeader } from './ui/surfaces';
import { StatusBadge } from './status-badge';

type FieldDraft = {
  key: string;
  label: string;
  type: CollectionFieldType;
  required: boolean;
};

const fieldTypes: CollectionFieldType[] = [
  'text',
  'long-text',
  'rich-text',
  'number',
  'boolean',
  'date',
  'datetime',
  'asset',
  'image',
  'url',
  'email',
  'slug',
  'select',
  'multi-select',
  'reference',
  'array',
  'group',
];

const newField = (): FieldDraft => ({
  key: '',
  label: '',
  type: 'text',
  required: false,
});

function parseEntryValues(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function entryTitle(entry: CollectionEntryResponse, collection: Collection): string {
  const value = collection.titleFieldKey
    ? entry.values[collection.titleFieldKey]
    : undefined;
  return value === undefined || value === null || String(value).trim() === ''
    ? entry.id.slice(0, 8)
    : String(value);
}

function entryPreviewValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') return 'Structured value';
  return String(value ?? '—');
}

function inputTypeForField(type: CollectionFieldType): string {
  if (type === 'number') return 'number';
  if (type === 'date') return 'date';
  if (type === 'datetime') return 'datetime-local';
  if (type === 'email') return 'email';
  if (type === 'url') return 'url';
  return 'text';
}

function CollectionEntryFields({
  collection,
  entryValues,
  onChange,
}: {
  collection: Collection;
  entryValues: string;
  onChange: (value: string) => void;
}) {
  const values = parseEntryValues(entryValues);
  const updateField = (field: Collection['fields'][number], value: unknown) => {
    const nextValues = { ...values };
    if (value === '' && !field.required) delete nextValues[field.key];
    else nextValues[field.key] = value;
    onChange(JSON.stringify(nextValues, null, 2));
  };

  return (
    <div className="collection-entry-fields">
      {collection.fields.map((field) => {
        const value = values[field.key];
        const displayValue =
          value === undefined || value === null
            ? ''
            : Array.isArray(value) || typeof value === 'object'
              ? JSON.stringify(value, null, 2)
              : String(value);

        if (field.type === 'boolean') {
          return (
            <label className="collection-entry-checkbox" key={field.id}>
              <span>
                <strong>{field.label}</strong>
                <small>{field.key}</small>
              </span>
              <input
                checked={value === true}
                onChange={(event) => updateField(field, event.target.checked)}
                type="checkbox"
              />
            </label>
          );
        }

        const multiline = [
          'long-text',
          'rich-text',
          'array',
          'group',
          'multi-select',
        ].includes(field.type);
        return (
          <label className="collection-entry-field" key={field.id}>
            <span className="collection-entry-field-label">
              <strong>{field.label}</strong>
              <small>
                {field.key} · {field.type}
                {field.required ? ' · required' : ''}
              </small>
            </span>
            {multiline ? (
              <textarea
                onChange={(event) => updateField(field, event.target.value)}
                placeholder={
                  field.type === 'array' ? 'Use JSON for structured values' : ''
                }
                rows={field.type === 'long-text' || field.type === 'rich-text' ? 4 : 3}
                value={displayValue}
              />
            ) : (
              <input
                onChange={(event) => {
                  const rawValue = event.target.value;
                  updateField(
                    field,
                    field.type === 'number' && rawValue !== ''
                      ? Number(rawValue)
                      : rawValue,
                  );
                }}
                type={inputTypeForField(field.type)}
                value={displayValue}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

export function CollectionsView({
  canCreate,
  canDelete,
  canPublish,
  canUpdate,
  selectedSiteId,
  sites,
  workspaceId,
}: {
  canCreate: boolean;
  canDelete: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  selectedSiteId: string;
  sites: Site[];
  workspaceId: string;
}) {
  const [siteId, setSiteId] = useState(selectedSiteId || sites[0]?.id || '');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [entries, setEntries] = useState<CollectionEntryResponse[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<CollectionEntryResponse | null>(
    null,
  );
  const [entrySearch, setEntrySearch] = useState('');
  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [collectionForm, setCollectionForm] = useState({
    key: '',
    name: '',
    singularName: '',
  });
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([newField()]);
  const [entryValues, setEntryValues] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === collectionId),
    [collectionId, collections],
  );
  const filteredEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const title = selectedCollection ? entryTitle(entry, selectedCollection) : entry.id;
      return [title, ...Object.values(entry.values)]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [entries, entrySearch, selectedCollection]);
  const publishedEntryCount = entries.filter(
    (entry) => entry.status === 'published',
  ).length;
  const draftEntryCount = entries.length - publishedEntryCount;

  useEffect(() => {
    if (selectedSiteId) setSiteId(selectedSiteId);
  }, [selectedSiteId]);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    void api
      .get<Collection[]>(`/workspaces/${workspaceId}/sites/${siteId}/collections`)
      .then((next) => {
        setCollections(next);
        setCollectionId((current) =>
          next.some((item) => item.id === current) ? current : (next[0]?.id ?? ''),
        );
      })
      .finally(() => setLoading(false));
  }, [siteId, workspaceId]);

  useEffect(() => {
    if (!siteId || !collectionId) {
      setEntries([]);
      return;
    }
    void api
      .get<{ items: CollectionEntryResponse[] }>(
        `/workspaces/${workspaceId}/sites/${siteId}/collections/${collectionId}/entries?limit=100&offset=0`,
      )
      .then((result) => setEntries(result.items));
  }, [collectionId, siteId, workspaceId]);

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = fieldDrafts
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field) => ({ ...field, key: field.key.trim(), label: field.label.trim() }));
    const created = await api.post<Collection>(
      `/workspaces/${workspaceId}/sites/${siteId}/collections`,
      { ...collectionForm, fields },
    );
    setCollections((current) => [...current, created]);
    setCollectionId(created.id);
    setCollectionDrawerOpen(false);
    setCollectionForm({ key: '', name: '', singularName: '' });
    setFieldDrafts([newField()]);
    setMessage(`Created ${created.name}.`);
  }

  async function updateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCollection || !canUpdate) return;
    const fields = fieldDrafts
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field, index) => ({
        ...field,
        id: selectedCollection.fields[index]?.id ?? crypto.randomUUID(),
        key: field.key.trim(),
        label: field.label.trim(),
        indexed: selectedCollection.fields[index]?.indexed ?? false,
        unique: selectedCollection.fields[index]?.unique ?? false,
        status: selectedCollection.fields[index]?.status ?? 'active',
        manualSlugOverride: selectedCollection.fields[index]?.manualSlugOverride ?? true,
      }));
    const updated = await api.patch<Collection>(
      `/workspaces/${workspaceId}/sites/${siteId}/collections/${selectedCollection.id}`,
      { fields, expectedSchemaVersion: selectedCollection.schemaVersion },
    );
    setCollections((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setCollectionDrawerOpen(false);
    setEditingCollectionId(null);
    setMessage('Collection schema updated.');
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCollection) return;
    const values = JSON.parse(entryValues) as Record<string, unknown>;
    const path = `/workspaces/${workspaceId}/sites/${siteId}/collections/${selectedCollection.id}/entries`;
    const saved = selectedEntry
      ? await api.patch<CollectionEntryResponse>(`${path}/${selectedEntry.id}`, {
          values,
          expectedVersionNumber: selectedEntry.versionNumber,
        })
      : await api.post<CollectionEntryResponse>(path, { values });
    setEntries((current) =>
      selectedEntry
        ? current.map((entry) => (entry.id === saved.id ? saved : entry))
        : [saved, ...current],
    );
    setSelectedEntry(saved);
    setEntryDrawerOpen(false);
    setMessage(selectedEntry ? 'Entry draft saved.' : 'Entry created as draft.');
  }

  async function publishEntry(entry: CollectionEntryResponse) {
    if (!canPublish || !selectedCollection) return;
    const saved = await api.post<CollectionEntryResponse>(
      `/workspaces/${workspaceId}/sites/${siteId}/collections/${selectedCollection.id}/entries/${entry.id}/publish`,
    );
    setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    setMessage('Entry published.');
  }

  async function archiveCollection() {
    if (!canDelete || !selectedCollection) return;
    await api.delete(
      `/workspaces/${workspaceId}/sites/${siteId}/collections/${selectedCollection.id}`,
    );
    setCollections((current) =>
      current.filter((item) => item.id !== selectedCollection.id),
    );
    setCollectionId('');
    setArchiveDialogOpen(false);
    setMessage('Collection archived.');
  }

  function editEntry(entry: CollectionEntryResponse) {
    setSelectedEntry(entry);
    setEntryValues(JSON.stringify(entry.values, null, 2));
    setEntryDrawerOpen(true);
  }

  function startNewEntry() {
    setSelectedEntry(null);
    setEntryValues('{}');
    setEntryDrawerOpen(true);
  }

  function editSchema() {
    if (!selectedCollection) return;
    setEditingCollectionId(selectedCollection.id);
    setFieldDrafts(
      selectedCollection.fields.map(({ key, label, type, required }) => ({
        key,
        label,
        type,
        required,
      })),
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Collections"
        description="Define structured content once, then use published entries in pages and repeaters."
        actions={
          <div className="form-actions">
            <select
              aria-label="Collection site"
              onChange={(event) => setSiteId(event.target.value)}
              value={siteId}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <button
              className="button button-primary"
              disabled={!siteId || !canCreate}
              onClick={() => {
                setEditingCollectionId(null);
                setCollectionForm({ key: '', name: '', singularName: '' });
                setFieldDrafts([newField()]);
                setCollectionDrawerOpen(true);
              }}
              type="button"
            >
              New collection
            </button>
          </div>
        }
      />
      {message ? (
        <div aria-live="polite" className="alert alert-success" role="status">
          {message}
        </div>
      ) : null}
      <section className="collection-summary-grid" aria-label="Collection summary">
        <article className="collection-summary-card collection-summary-card-primary">
          <span className="collection-summary-icon" aria-hidden="true">
            ▥
          </span>
          <span>
            <small>Content models</small>
            <strong>{collections.length}</strong>
          </span>
          <span className="collection-summary-note">Reusable schemas</span>
        </article>
        <article className="collection-summary-card">
          <span className="collection-summary-icon" aria-hidden="true">
            ◈
          </span>
          <span>
            <small>Entries in view</small>
            <strong>{entries.length}</strong>
          </span>
          <span className="collection-summary-note">
            {selectedCollection?.name ?? 'Select a model'}
          </span>
        </article>
        <article className="collection-summary-card">
          <span className="collection-summary-icon" aria-hidden="true">
            ✓
          </span>
          <span>
            <small>Published</small>
            <strong>{publishedEntryCount}</strong>
          </span>
          <span className="collection-summary-note">Ready for delivery</span>
        </article>
        <article className="collection-summary-card">
          <span className="collection-summary-icon" aria-hidden="true">
            ◌
          </span>
          <span>
            <small>Drafts</small>
            <strong>{draftEntryCount}</strong>
          </span>
          <span className="collection-summary-note">Need review</span>
        </article>
      </section>
      <div className="collection-workspace">
        <section className="panel collection-library-panel">
          <div className="collection-section-heading">
            <div>
              <span className="eyebrow">Content models</span>
              <h2>Collections</h2>
            </div>
            <span className="collection-count-pill">{collections.length}</span>
          </div>
          <p className="collection-panel-intro">
            Choose a schema to manage its content and publishing state.
          </p>
          {loading ? (
            <div className="collection-loading" role="status">
              <span className="skeleton" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ) : collections.length === 0 ? (
            <div className="collection-empty-state">
              <span className="collection-empty-icon" aria-hidden="true">
                ＋
              </span>
              <strong>No collections yet</strong>
              <p className="muted">Create your first structured content model.</p>
              <button
                className="button button-small button-secondary"
                disabled={!siteId || !canCreate}
                onClick={() => {
                  setEditingCollectionId(null);
                  setCollectionForm({ key: '', name: '', singularName: '' });
                  setFieldDrafts([newField()]);
                  setCollectionDrawerOpen(true);
                }}
                type="button"
              >
                Create collection
              </button>
            </div>
          ) : (
            <div className="collection-library-list">
              {collections.map((collection) => (
                <button
                  aria-current={collection.id === collectionId ? 'page' : undefined}
                  className={
                    collection.id === collectionId
                      ? 'collection-library-item is-active'
                      : 'collection-library-item'
                  }
                  key={collection.id}
                  onClick={() => {
                    setCollectionId(collection.id);
                    setEntrySearch('');
                  }}
                  type="button"
                >
                  <span className="collection-library-mark" aria-hidden="true">
                    ◈
                  </span>
                  <span className="collection-library-copy">
                    <strong>{collection.name}</strong>
                    <small>{collection.key}</small>
                    <span>
                      {collection.fields.length} fields
                      <span aria-hidden="true"> · </span>
                      {collection.id === collectionId
                        ? `${entries.length} entries`
                        : 'Schema ready'}
                    </span>
                  </span>
                  <span className="collection-library-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel collection-detail-panel">
          {selectedCollection ? (
            <>
              <div className="collection-detail-header">
                <div className="collection-detail-title">
                  <span className="collection-detail-mark" aria-hidden="true">
                    ◈
                  </span>
                  <div>
                    <span className="eyebrow">{selectedCollection.key}</span>
                    <h2>{selectedCollection.name}</h2>
                    <p className="muted">
                      Manage the records powering your pages and dynamic routes.
                    </p>
                  </div>
                </div>
                <div className="form-actions collection-detail-actions">
                  <button
                    className="button button-small button-ghost"
                    disabled={!canUpdate}
                    onClick={() => {
                      editSchema();
                      setCollectionDrawerOpen(true);
                    }}
                    type="button"
                  >
                    Edit schema
                  </button>
                  <button
                    className="button button-small button-danger"
                    disabled={!canDelete}
                    onClick={() => setArchiveDialogOpen(true)}
                    type="button"
                  >
                    Archive
                  </button>
                </div>
              </div>
              <div className="collection-detail-stats">
                <span>
                  <strong>{selectedCollection.fields.length}</strong> schema fields
                </span>
                <span>
                  <strong>{entries.length}</strong> total entries
                </span>
                <span>
                  <strong>{publishedEntryCount}</strong> published
                </span>
              </div>
              <div className="collection-schema-preview">
                <div className="collection-subsection-heading">
                  <div>
                    <span className="eyebrow">Schema preview</span>
                    <h3>Fields available to pages</h3>
                  </div>
                  <button
                    className="button button-small button-ghost"
                    disabled={!canUpdate}
                    onClick={() => {
                      editSchema();
                      setCollectionDrawerOpen(true);
                    }}
                    type="button"
                  >
                    Manage fields
                  </button>
                </div>
                <div className="collection-field-chips">
                  {selectedCollection.fields.map((field) => (
                    <span className="collection-field-chip" key={field.id}>
                      <strong>{field.label}</strong>
                      <small>
                        {field.type}
                        {field.required ? ' · required' : ''}
                      </small>
                      {field.unique ? (
                        <span aria-label="Unique field">Unique</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
              <div className="collection-entries-section">
                <div className="collection-subsection-heading collection-entries-heading">
                  <div>
                    <span className="eyebrow">Content</span>
                    <h3>{selectedCollection.singularName} entries</h3>
                    <p className="muted">Click a record to edit it in the side drawer.</p>
                  </div>
                  <button
                    className="button button-primary"
                    disabled={!canCreate}
                    onClick={startNewEntry}
                    type="button"
                  >
                    New entry
                  </button>
                </div>
                <div className="collection-entry-toolbar">
                  <label className="collection-search-field">
                    <span className="sr-only">Search entries</span>
                    <span className="collection-search-icon" aria-hidden="true">
                      ⌕
                    </span>
                    <input
                      onChange={(event) => setEntrySearch(event.target.value)}
                      placeholder={`Search ${selectedCollection.singularName.toLowerCase()} entries`}
                      value={entrySearch}
                    />
                  </label>
                  <span className="muted small">
                    {filteredEntries.length} of {entries.length} shown
                  </span>
                </div>
                {entries.length === 0 ? (
                  <div className="collection-empty-state collection-empty-state-wide">
                    <span className="collection-empty-icon" aria-hidden="true">
                      ◈
                    </span>
                    <strong>No entries yet</strong>
                    <p className="muted">Create the first record for this collection.</p>
                    <button
                      className="button button-small button-secondary"
                      disabled={!canCreate}
                      onClick={startNewEntry}
                      type="button"
                    >
                      Add entry
                    </button>
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="collection-no-results">
                    <strong>No matching entries</strong>
                    <span className="muted">Try another search term.</span>
                  </div>
                ) : (
                  <div className="collection-entry-list">
                    {filteredEntries.map((entry) => {
                      const previewFields = selectedCollection.fields
                        .filter((field) => field.key !== selectedCollection.titleFieldKey)
                        .slice(0, 2);
                      return (
                        <article className="collection-entry-row" key={entry.id}>
                          <button
                            className="collection-entry-main"
                            onClick={() => editEntry(entry)}
                            type="button"
                          >
                            <span className="collection-entry-avatar" aria-hidden="true">
                              {entryTitle(entry, selectedCollection)
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>
                            <span className="collection-entry-copy">
                              <strong>{entryTitle(entry, selectedCollection)}</strong>
                              <small>
                                {previewFields
                                  .map(
                                    (field) =>
                                      `${field.label}: ${entryPreviewValue(entry.values[field.key])}`,
                                  )
                                  .join(' · ')}
                              </small>
                            </span>
                          </button>
                          <span className="collection-entry-version">
                            v{entry.versionNumber}
                          </span>
                          <StatusBadge status={entry.status} />
                          <div className="collection-entry-actions">
                            {entry.status !== 'published' ? (
                              <button
                                className="button button-small button-primary"
                                disabled={!canPublish}
                                onClick={() => void publishEntry(entry)}
                                type="button"
                              >
                                Publish
                              </button>
                            ) : null}
                            <button
                              aria-label={`Edit ${entryTitle(entry, selectedCollection)}`}
                              className="button button-small button-ghost"
                              onClick={() => editEntry(entry)}
                              type="button"
                            >
                              Edit
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="collection-detail-empty">
              <span className="collection-detail-empty-mark" aria-hidden="true">
                ◈
              </span>
              <span className="eyebrow">Content model</span>
              <h2>Select a collection</h2>
              <p className="muted">
                Choose a model from the library to view its schema and entries.
              </p>
            </div>
          )}
        </section>
      </div>
      <Drawer
        eyebrow={editingCollectionId ? 'Schema editor' : 'Content model'}
        description="Collections are versioned metadata. Field keys become the safe query and binding vocabulary."
        footer={
          <div className="form-actions">
            <button
              className="button button-primary"
              form="collection-form"
              type="submit"
            >
              Save collection
            </button>
            <button
              className="button button-ghost"
              onClick={() => setCollectionDrawerOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        onClose={() => setCollectionDrawerOpen(false)}
        open={collectionDrawerOpen}
        size="lg"
        title={
          editingCollectionId && selectedCollection
            ? `Edit ${selectedCollection.name}`
            : 'New collection'
        }
      >
        <form
          className="stack"
          id="collection-form"
          onSubmit={(event) =>
            void (editingCollectionId ? updateCollection(event) : createCollection(event))
          }
        >
          {!editingCollectionId ? (
            <>
              <label>
                Collection key
                <input
                  pattern="[a-z][a-z0-9-]*"
                  required
                  value={collectionForm.key}
                  onChange={(event) =>
                    setCollectionForm({ ...collectionForm, key: event.target.value })
                  }
                />
              </label>
              <label>
                Name
                <input
                  required
                  value={collectionForm.name}
                  onChange={(event) =>
                    setCollectionForm({ ...collectionForm, name: event.target.value })
                  }
                />
              </label>
              <label>
                Singular name
                <input
                  required
                  value={collectionForm.singularName}
                  onChange={(event) =>
                    setCollectionForm({
                      ...collectionForm,
                      singularName: event.target.value,
                    })
                  }
                />
              </label>
            </>
          ) : null}
          <div className="collection-drawer-section-heading">
            <div>
              <span className="eyebrow">Schema</span>
              <h3>Fields</h3>
              <p className="muted small">Define the data available in every entry.</p>
            </div>
            <span className="collection-count-pill">{fieldDrafts.length}</span>
          </div>
          <div className="collection-drawer-field-actions">
            <button
              className="button button-small button-secondary"
              onClick={() => setFieldDrafts((current) => [...current, newField()])}
              type="button"
            >
              + Add field
            </button>
          </div>
          {fieldDrafts.map((field, index) => (
            <div className="collection-drawer-field-card" key={`${field.key}-${index}`}>
              <div className="collection-drawer-field-card-header">
                <span className="collection-field-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{field.label || 'Untitled field'}</strong>
                {field.key ? <code>{field.key}</code> : null}
                {fieldDrafts.length > 1 ? (
                  <button
                    aria-label={`Remove field ${index + 1}`}
                    className="button button-small button-ghost"
                    onClick={() =>
                      setFieldDrafts((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="collection-drawer-field-grid">
                <label>
                  Key
                  <input
                    pattern="[a-z][a-z0-9_]*"
                    required
                    value={field.key}
                    onChange={(event) =>
                      setFieldDrafts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, key: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Label
                  <input
                    required
                    value={field.label}
                    onChange={(event) =>
                      setFieldDrafts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Type
                  <select
                    value={field.type}
                    onChange={(event) =>
                      setFieldDrafts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, type: event.target.value as CollectionFieldType }
                            : item,
                        ),
                      )
                    }
                  >
                    {fieldTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="collection-required-toggle">
                  <span>Validation</span>
                  <span>
                    <input
                      checked={field.required}
                      onChange={(event) =>
                        setFieldDrafts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, required: event.target.checked }
                              : item,
                          ),
                        )
                      }
                      type="checkbox"
                    />
                    Required field
                  </span>
                </label>
              </div>
            </div>
          ))}
        </form>
      </Drawer>
      <Drawer
        eyebrow={selectedCollection?.name ?? 'Collection'}
        description="Entry drafts are immutable versions. Publish promotes one version atomically to public delivery."
        footer={
          <div className="form-actions">
            <button className="button button-primary" form="entry-form" type="submit">
              Save draft
            </button>
            <button
              className="button button-ghost"
              onClick={() => setEntryDrawerOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        onClose={() => setEntryDrawerOpen(false)}
        open={entryDrawerOpen}
        size="lg"
        title={
          selectedEntry
            ? 'Edit entry'
            : `New ${selectedCollection?.singularName ?? 'entry'}`
        }
      >
        <form
          className="collection-entry-form"
          id="entry-form"
          onSubmit={(event) => {
            void saveEntry(event).catch(() =>
              setMessage('Entry values must be valid JSON or failed validation.'),
            );
          }}
        >
          {selectedCollection ? (
            <>
              <div className="collection-entry-form-intro">
                <div>
                  <span className="eyebrow">
                    {selectedEntry ? 'Edit record' : 'New record'}
                  </span>
                  <h3>
                    {selectedEntry
                      ? entryTitle(selectedEntry, selectedCollection)
                      : 'Untitled entry'}
                  </h3>
                </div>
                {selectedEntry ? <StatusBadge status={selectedEntry.status} /> : null}
              </div>
              <CollectionEntryFields
                collection={selectedCollection}
                entryValues={entryValues}
                onChange={setEntryValues}
              />
              <details className="collection-entry-advanced">
                <summary>Advanced JSON</summary>
                <p className="muted small">
                  Use the field keys from the schema for structured values.
                </p>
                <textarea
                  aria-label="Entry values"
                  rows={12}
                  value={entryValues}
                  onChange={(event) => setEntryValues(event.target.value)}
                />
              </details>
            </>
          ) : null}
        </form>
      </Drawer>
      <Modal
        eyebrow="Destructive action"
        description="Archiving removes this collection from the active workspace. Existing page bindings may no longer resolve its data."
        footer={
          <div className="form-actions">
            <button
              className="button button-danger"
              onClick={() => void archiveCollection()}
              type="button"
            >
              Archive collection
            </button>
            <button
              className="button button-ghost"
              onClick={() => setArchiveDialogOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        }
        onClose={() => setArchiveDialogOpen(false)}
        open={archiveDialogOpen}
        size="sm"
        title={`Archive ${selectedCollection?.name ?? 'collection'}?`}
      >
        <div className="collection-archive-warning">
          <span className="collection-archive-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>This action cannot be undone from this screen.</strong>
            <p className="muted">
              Make sure no published page still depends on{' '}
              <strong>{selectedCollection?.name ?? 'this collection'}</strong>.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
