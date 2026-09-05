'use client';

import {
  AssetListResponseSchema,
  CollectionEntryListResponseSchema,
  type Asset,
  type Collection,
  type CollectionEntryResponse,
  type CollectionFieldType,
} from '@payload/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ApiClientError, api } from '../lib/api';
import { Modal } from '../ui/surfaces';
import { SearchField } from '../ui/primitives';

export type CollectionFieldControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multi-select'
  | 'asset'
  | 'reference'
  | 'structured';

export type EntryDraft = Record<string, unknown>;

export function collectionFieldControl(
  type: CollectionFieldType,
): CollectionFieldControl {
  if (type === 'long-text' || type === 'rich-text') return 'textarea';
  if (type === 'array' || type === 'group') return 'structured';
  if (type === 'image') return 'asset';
  if (type === 'text' || type === 'url' || type === 'email' || type === 'slug')
    return 'text';
  if (type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'date') return 'date';
  if (type === 'datetime') return 'datetime';
  if (type === 'select') return 'select';
  if (type === 'multi-select') return 'multi-select';
  if (type === 'asset') return 'asset';
  if (type === 'reference') return 'reference';
  return 'text';
}

export function filterAssets(
  assets: readonly Asset[],
  search: string,
  mediaType: 'all' | 'image' | 'video' | 'audio' | 'document',
): Asset[] {
  const normalizedSearch = search.trim().toLowerCase();
  return assets.filter((asset) => {
    const matchesSearch =
      !normalizedSearch ||
      asset.filename.toLowerCase().includes(normalizedSearch) ||
      asset.mimeType.toLowerCase().includes(normalizedSearch);
    const matchesType =
      mediaType === 'all' || asset.mimeType.toLowerCase().startsWith(`${mediaType}/`);
    return matchesSearch && matchesType;
  });
}

export function referenceIds(value: unknown, cardinality: 'one' | 'many'): string[] {
  if (cardinality === 'many') return Array.isArray(value) ? value.filter(isString) : [];
  return isString(value) ? [value] : [];
}

export function updateEntryDraft(
  draft: EntryDraft,
  field: Collection['fields'][number],
  value: unknown,
): EntryDraft {
  const next = { ...draft };
  if (value === '' || value === undefined) {
    if (!field.required) delete next[field.key];
    else next[field.key] = value;
  } else {
    next[field.key] = value;
  }
  return next;
}

export function serializeStructuredValue(value: unknown): string {
  if (value === undefined) return '';
  return JSON.stringify(value, null, 2);
}

export function parseStructuredValue(
  value: string,
): { success: true; value: unknown } | { success: false } {
  try {
    return { success: true, value: JSON.parse(value) as unknown };
  } catch {
    return { success: false };
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isEntityId(value: unknown): value is string {
  return (
    isString(value) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}

export function dateInputValue(value: unknown, type: 'date' | 'datetime'): string {
  const string = displayValue(value);
  if (!string) return '';
  if (type === 'date') return string.slice(0, 10);
  const parsed = new Date(string);
  if (Number.isNaN(parsed.getTime())) return string.slice(0, 16);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function normalizeDateTimeInput(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function isValidNumberInput(value: string): boolean {
  return (
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) &&
    Number.isFinite(Number(value))
  );
}

function entryTitle(entry: CollectionEntryResponse, collection: Collection): string {
  const value = collection.titleFieldKey
    ? entry.values[collection.titleFieldKey]
    : undefined;
  return value === undefined || value === null || String(value).trim() === ''
    ? `Entry ${entry.id.slice(0, 8)}`
    : String(value);
}

function assetMediaType(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  const [type] = mimeType.toLowerCase().split('/');
  if (type === 'image' || type === 'video' || type === 'audio') return type;
  return 'document';
}

export function AssetPicker({
  allowExternalUrl = false,
  onChange,
  onRemove,
  value,
  workspaceId,
  disabled = false,
}: {
  allowExternalUrl?: boolean;
  disabled?: boolean;
  onChange: (assetId: string) => void;
  onRemove: () => void;
  value: unknown;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mediaType, setMediaType] = useState<
    'all' | 'image' | 'video' | 'audio' | 'document'
  >('all');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedAssetUnavailable, setSelectedAssetUnavailable] = useState(false);
  const listRequestSequence = useRef(0);
  const selectedRequestSequence = useRef(0);
  const selectedValue = isString(value) ? value : '';

  useEffect(() => {
    if (!selectedValue || !isEntityId(selectedValue)) {
      setSelectedAsset(null);
      setSelectedAssetUnavailable(false);
      return;
    }
    const sequence = ++selectedRequestSequence.current;
    setSelectedAssetUnavailable(false);
    void api
      .get<Asset>(`/workspaces/${workspaceId}/assets/${selectedValue}`)
      .then((asset) => {
        if (sequence !== selectedRequestSequence.current) return;
        setSelectedAsset(asset);
      })
      .catch(() => {
        if (sequence !== selectedRequestSequence.current) return;
        setSelectedAsset(null);
        setSelectedAssetUnavailable(true);
      });
  }, [selectedValue, workspaceId]);

  useEffect(() => {
    if (!open) return;
    const sequence = ++listRequestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: String(pagination.limit),
        offset: String(offset),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(mediaType !== 'all' ? { mediaType } : {}),
      });
      void api
        .get<unknown>(`/workspaces/${workspaceId}/assets?${params.toString()}`)
        .then((response) => {
          if (sequence !== listRequestSequence.current) return;
          const parsed = AssetListResponseSchema.parse(response);
          setAssets(parsed.items);
          setPagination(parsed.pagination);
        })
        .catch((caughtError: unknown) => {
          if (sequence !== listRequestSequence.current) return;
          setError(
            caughtError instanceof ApiClientError
              ? caughtError.message
              : 'Unable to load assets.',
          );
        })
        .finally(() => {
          if (sequence === listRequestSequence.current) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [mediaType, offset, open, pagination.limit, search, workspaceId]);

  const externalImageUrl =
    allowExternalUrl && selectedValue && !isEntityId(selectedValue)
      ? selectedValue
      : undefined;
  const visibleAssets = assets;

  return (
    <div className="collection-picker">
      {selectedAsset ? (
        <div className="collection-picker-current">
          {selectedAsset.mimeType.toLowerCase().startsWith('image/') ? (
            <img alt="" src={selectedAsset.storageKey} />
          ) : (
            <span className="collection-picker-file" aria-hidden="true">
              ▧
            </span>
          )}
          <span>
            <strong>{selectedAsset.filename}</strong>
            <small>{selectedAsset.mimeType}</small>
          </span>
        </div>
      ) : externalImageUrl ? (
        <div className="collection-picker-current">
          <img alt="" src={externalImageUrl} />
          <span>
            <strong>External image</strong>
            <small>{externalImageUrl}</small>
          </span>
        </div>
      ) : selectedAssetUnavailable ? (
        <div className="collection-picker-stale" role="status">
          Selected asset is unavailable. Choose a replacement or remove it.
        </div>
      ) : (
        <div className="collection-picker-empty">No asset selected.</div>
      )}
      <div className="collection-picker-actions">
        <button
          className="button button-small button-secondary"
          disabled={disabled}
          onClick={() => setOpen(true)}
          type="button"
        >
          {selectedAsset || selectedValue ? 'Change asset' : 'Select asset'}
        </button>
        {selectedAsset || selectedValue ? (
          <button
            className="button button-small button-ghost"
            disabled={disabled}
            onClick={onRemove}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </div>
      {error && !open ? (
        <p className="muted small" role="alert">
          {error}
        </p>
      ) : null}
      <Modal
        description="Select a workspace asset. Only the asset ID is saved in the collection entry."
        onClose={() => setOpen(false)}
        open={open}
        size="lg"
        title="Select asset"
      >
        <div className="collection-picker-toolbar">
          <SearchField
            label="Search assets"
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder="Search filename or media type"
            value={search}
          />
          <label className="inline-field">
            Media type
            <select
              aria-label="Filter assets by media type"
              onChange={(event) => {
                setMediaType(event.target.value as typeof mediaType);
                setOffset(0);
              }}
              value={mediaType}
            >
              <option value="all">All media</option>
              <option value="image">Images</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div aria-busy="true" className="collection-picker-state">
            Loading assets…
          </div>
        ) : visibleAssets.length === 0 ? (
          <div className="collection-picker-state">{error ?? 'No assets available.'}</div>
        ) : (
          <div className="collection-picker-list">
            {visibleAssets.map((asset) => (
              <div className="collection-picker-row" key={asset.id}>
                {assetMediaType(asset.mimeType) === 'image' ? (
                  <img alt="" src={asset.storageKey} />
                ) : (
                  <span className="collection-picker-file" aria-hidden="true">
                    ▧
                  </span>
                )}
                <span>
                  <strong>{asset.filename}</strong>
                  <small>{asset.mimeType}</small>
                </span>
                <button
                  className="button button-small button-primary"
                  disabled={disabled}
                  onClick={() => {
                    onChange(asset.id);
                    setSelectedAsset(asset);
                    setSelectedAssetUnavailable(false);
                    setOpen(false);
                  }}
                  type="button"
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        )}
        {error ? (
          <p className="muted small" role="alert">
            {error}
          </p>
        ) : null}
        <div className="collection-pagination-actions form-actions">
          <button
            className="button button-small button-ghost"
            disabled={loading || offset === 0}
            onClick={() =>
              setOffset((current) => Math.max(0, current - pagination.limit))
            }
            type="button"
          >
            Previous
          </button>
          <span className="muted small">
            Page {Math.floor(offset / pagination.limit) + 1}
          </span>
          <button
            className="button button-small button-ghost"
            disabled={loading || !pagination.hasNextPage}
            onClick={() => setOffset((current) => current + pagination.limit)}
            type="button"
          >
            Next
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function ReferencePicker({
  cardinality,
  collection,
  onChange,
  siteId,
  value,
  workspaceId,
  disabled = false,
}: {
  cardinality: 'one' | 'many';
  collection: Collection | undefined;
  disabled?: boolean;
  onChange: (value: string | string[] | undefined) => void;
  siteId: string;
  value: unknown;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CollectionEntryResponse[]>([]);
  const [selectedItems, setSelectedItems] = useState<CollectionEntryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(() => new Set());
  const listRequestSequence = useRef(0);
  const selectedRequestSequence = useRef(0);
  const ids = useMemo(() => referenceIds(value, cardinality), [cardinality, value]);
  const selectedIdSet = useMemo(() => new Set(ids), [ids]);
  const idKey = ids.join('|');
  const collectionPath = collection
    ? `/workspaces/${workspaceId}/sites/${siteId}/collections/${collection.id}/entries`
    : '';

  useEffect(() => {
    setItems([]);
    setSelectedItems([]);
    setUnavailableIds(new Set());
    setOffset(0);
  }, [collectionPath]);

  useEffect(() => {
    if (!open || !collectionPath) return;
    const sequence = ++listRequestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: String(pagination.limit),
        offset: String(offset),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      void api
        .get<unknown>(`${collectionPath}?${params.toString()}`)
        .then((response) => {
          if (sequence !== listRequestSequence.current) return;
          const parsed = CollectionEntryListResponseSchema.parse(response);
          setItems(parsed.items.filter((entry) => entry.status !== 'archived'));
          setPagination(parsed.pagination);
        })
        .catch((caughtError: unknown) => {
          if (sequence !== listRequestSequence.current) return;
          setError(
            caughtError instanceof ApiClientError
              ? caughtError.message
              : 'Unable to load reference entries.',
          );
        })
        .finally(() => {
          if (sequence === listRequestSequence.current) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [collectionPath, offset, open, pagination.limit, search]);

  useEffect(() => {
    if (!collectionPath) return;
    const missingIds = ids.filter(
      (id) =>
        !items.some((entry) => entry.id === id) &&
        !selectedItems.some((entry) => entry.id === id) &&
        !unavailableIds.has(id),
    );
    if (missingIds.length === 0) return;
    const sequence = ++selectedRequestSequence.current;
    void Promise.all(
      missingIds.slice(0, 20).map((id) =>
        api
          .get<CollectionEntryResponse>(`${collectionPath}/${encodeURIComponent(id)}`)
          .then((entry) => ({ id, entry }))
          .catch(() => ({ id, entry: null })),
      ),
    ).then((resolved) => {
      if (sequence !== selectedRequestSequence.current) return;
      const available = resolved.flatMap(({ entry }) => (entry ? [entry] : []));
      const missing = resolved.filter(({ entry }) => !entry).map(({ id }) => id);
      setSelectedItems((current) => [
        ...current.filter((entry) => ids.includes(entry.id)),
        ...available.filter((entry) => !current.some((item) => item.id === entry.id)),
      ]);
      if (missing.length) {
        setUnavailableIds((current) => new Set([...current, ...missing]));
      }
    });
  }, [collectionPath, idKey, items, selectedItems, unavailableIds]);

  const allKnownItems = [...selectedItems, ...items].filter(
    (entry, index, all) =>
      all.findIndex((candidate) => candidate.id === entry.id) === index,
  );
  const selectedLabels = ids.map((id) => {
    const entry = allKnownItems.find((candidate) => candidate.id === id);
    if (!entry || !collection) return 'Unavailable reference';
    return entry.status === 'archived'
      ? `Archived reference · ${entryTitle(entry, collection)}`
      : entryTitle(entry, collection);
  });
  const availableItems = allKnownItems.filter((entry) => entry.status !== 'archived');

  function updateSelection(nextIds: string[]) {
    onChange(cardinality === 'many' ? nextIds : nextIds[0]);
  }

  if (!collection) {
    return (
      <div className="collection-picker-stale" role="alert">
        Target collection is unavailable.
      </div>
    );
  }

  return (
    <div className="collection-picker">
      {selectedLabels.length ? (
        <div className="collection-reference-current">
          {selectedLabels.map((label, index) => (
            <span className="collection-reference-chip" key={`${ids[index]}-${index}`}>
              {label}
            </span>
          ))}
        </div>
      ) : (
        <div className="collection-picker-empty">No reference selected.</div>
      )}
      {ids.some((id) => unavailableIds.has(id)) ? (
        <div className="collection-picker-stale" role="status">
          One or more selected references are unavailable. Choose a replacement or remove
          them.
        </div>
      ) : null}
      <div className="collection-picker-actions">
        <button
          className="button button-small button-secondary"
          disabled={disabled}
          onClick={() => setOpen(true)}
          type="button"
        >
          {selectedLabels.length ? 'Change reference' : 'Select reference'}
        </button>
        {selectedLabels.length ? (
          <button
            className="button button-small button-ghost"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="muted small" role="alert">
          {error}
        </p>
      ) : null}
      <Modal
        description={`Choose ${cardinality === 'many' ? 'one or more' : 'an'} entry from ${collection.name}.`}
        footer={
          cardinality === 'many' ? (
            <button
              className="button button-primary"
              onClick={() => setOpen(false)}
              type="button"
            >
              Done
            </button>
          ) : undefined
        }
        onClose={() => setOpen(false)}
        open={open}
        size="lg"
        title={`Select ${collection.singularName}`}
      >
        <SearchField
          label="Search entries"
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder={`Search ${collection.singularName.toLowerCase()} entries`}
          value={search}
        />
        {loading ? (
          <div aria-busy="true" className="collection-picker-state">
            Loading entries…
          </div>
        ) : availableItems.length === 0 ? (
          <div className="collection-picker-state">{error ?? 'No entries found.'}</div>
        ) : (
          <div className="collection-picker-list">
            {availableItems.map((entry) => {
              const selected = selectedIdSet.has(entry.id);
              return (
                <div className="collection-picker-row" key={entry.id}>
                  <span className="collection-picker-file" aria-hidden="true">
                    ◈
                  </span>
                  <span>
                    <strong>{entryTitle(entry, collection)}</strong>
                    <small>{entry.status === 'published' ? 'Published' : 'Draft'}</small>
                  </span>
                  <button
                    className="button button-small button-primary"
                    disabled={disabled}
                    onClick={() => {
                      const nextIds =
                        cardinality === 'many'
                          ? selected
                            ? ids.filter((id) => id !== entry.id)
                            : [...ids, entry.id]
                          : [entry.id];
                      updateSelection(nextIds);
                      setSelectedItems((current) => [
                        ...current.filter((item) => item.id !== entry.id),
                        entry,
                      ]);
                      if (cardinality === 'one') setOpen(false);
                    }}
                    type="button"
                  >
                    {selected ? 'Selected' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {error ? (
          <p className="muted small" role="alert">
            {error}
          </p>
        ) : null}
        <div className="collection-pagination-actions form-actions">
          <button
            className="button button-small button-ghost"
            disabled={loading || offset === 0}
            onClick={() =>
              setOffset((current) => Math.max(0, current - pagination.limit))
            }
            type="button"
          >
            Previous
          </button>
          <span className="muted small">
            Page {Math.floor(offset / pagination.limit) + 1}
          </span>
          <button
            className="button button-small button-ghost"
            disabled={loading || !pagination.hasNextPage}
            onClick={() => setOffset((current) => current + pagination.limit)}
            type="button"
          >
            Next
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function CollectionEntryFields({
  collection,
  collections,
  disabled = false,
  advancedJsonDrafts,
  advancedJsonErrors,
  entryDraft,
  onAdvancedJsonChange,
  onChange,
  siteId,
  workspaceId,
}: {
  advancedJsonDrafts: Record<string, string>;
  advancedJsonErrors: Record<string, string | undefined>;
  collection: Collection;
  collections: readonly Collection[];
  disabled?: boolean;
  entryDraft: EntryDraft;
  onAdvancedJsonChange: (fieldKey: string, value: string) => void;
  onChange: (value: EntryDraft) => void;
  siteId: string;
  workspaceId: string;
}) {
  const values = entryDraft;
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const [numberErrors, setNumberErrors] = useState<Record<string, string | undefined>>(
    {},
  );

  const updateField = (field: Collection['fields'][number], value: unknown) => {
    onChange(updateEntryDraft(values, field, value));
  };

  const updateNumber = (field: Collection['fields'][number], rawValue: string) => {
    setNumberDrafts((current) => ({ ...current, [field.key]: rawValue }));
    if (rawValue === '') {
      setNumberErrors((current) => ({ ...current, [field.key]: undefined }));
      updateField(field, undefined);
      return;
    }
    const parsed = Number(rawValue);
    if (!isValidNumberInput(rawValue)) return;
    setNumberErrors((current) => ({ ...current, [field.key]: undefined }));
    updateField(field, parsed);
  };

  return (
    <div className="collection-entry-fields">
      {collection.fields.map((field) => {
        const value = values[field.key];
        const control = collectionFieldControl(field.type);
        const label = (
          <span className="collection-entry-field-label">
            <strong>{field.label}</strong>
            <small>
              {field.key} · {field.type}
              {field.required ? ' · required' : ''}
            </small>
          </span>
        );

        if (control === 'boolean') {
          return (
            <label className="collection-entry-checkbox" key={field.id}>
              <span>
                <strong>{field.label}</strong>
                <small>{field.key}</small>
              </span>
              <input
                checked={value === true}
                disabled={disabled}
                onChange={(event) => updateField(field, event.target.checked)}
                type="checkbox"
              />
            </label>
          );
        }
        if (control === 'select') {
          return (
            <label className="collection-entry-field" key={field.id}>
              {label}
              <select
                disabled={disabled}
                value={displayValue(value)}
                onChange={(event) => updateField(field, event.target.value)}
              >
                <option value="">Choose an option</option>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.ui?.helpText ? (
                <small className="muted">{field.ui.helpText}</small>
              ) : null}
            </label>
          );
        }
        if (control === 'multi-select') {
          const selected = Array.isArray(value) ? value.map(String) : [];
          return (
            <fieldset className="collection-entry-field" key={field.id}>
              <legend className="collection-entry-field-label">{label}</legend>
              <div className="collection-option-list">
                {(field.options ?? []).map((option) => (
                  <label className="checkbox-field" key={option.value}>
                    <input
                      checked={selected.includes(option.value)}
                      disabled={disabled}
                      onChange={(event) =>
                        updateField(
                          field,
                          event.target.checked
                            ? [...selected, option.value]
                            : selected.filter((item) => item !== option.value),
                        )
                      }
                      type="checkbox"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        if (control === 'asset') {
          return (
            <div className="collection-entry-field" key={field.id}>
              {label}
              <AssetPicker
                allowExternalUrl={field.type === 'image'}
                disabled={disabled}
                onChange={(assetId) => updateField(field, assetId)}
                onRemove={() => updateField(field, undefined)}
                value={value}
                workspaceId={workspaceId}
              />
              {field.type === 'image' ? (
                <label>
                  Or use an image URL
                  <input
                    disabled={disabled}
                    onChange={(event) => updateField(field, event.target.value)}
                    placeholder="https://… or /assets/…"
                    type="url"
                    value={typeof value === 'string' && !isEntityId(value) ? value : ''}
                  />
                </label>
              ) : null}
              {field.ui?.helpText ? (
                <small className="muted">{field.ui.helpText}</small>
              ) : null}
            </div>
          );
        }
        if (control === 'reference') {
          const target = field.targetCollectionId
            ? collections.find((candidate) => candidate.id === field.targetCollectionId)
            : undefined;
          return (
            <div className="collection-entry-field" key={field.id}>
              {label}
              <ReferencePicker
                cardinality={field.cardinality ?? 'one'}
                collection={target}
                disabled={disabled}
                onChange={(next) => updateField(field, next)}
                siteId={siteId}
                value={value}
                workspaceId={workspaceId}
              />
              {field.ui?.helpText ? (
                <small className="muted">{field.ui.helpText}</small>
              ) : null}
            </div>
          );
        }
        if (control === 'structured') {
          return (
            <label className="collection-entry-field" key={field.id}>
              {label}
              <textarea
                aria-label={`Advanced JSON · ${field.label}`}
                disabled={disabled}
                onChange={(event) => onAdvancedJsonChange(field.key, event.target.value)}
                placeholder={field.type === 'array' ? '[]' : '{}'}
                rows={6}
                value={advancedJsonDrafts[field.key] ?? serializeStructuredValue(value)}
              />
              {advancedJsonErrors[field.key] ? (
                <small className="alert-error-text" role="alert">
                  {advancedJsonErrors[field.key]}
                </small>
              ) : (
                <small className="muted">
                  Advanced JSON is scoped to this {field.type} field.
                </small>
              )}
            </label>
          );
        }
        const multiline = control === 'textarea';
        return (
          <label className="collection-entry-field" key={field.id}>
            {label}
            {multiline ? (
              <textarea
                disabled={disabled}
                onChange={(event) => updateField(field, event.target.value)}
                placeholder={field.ui?.placeholder ?? ''}
                rows={4}
                value={displayValue(value)}
              />
            ) : (
              <input
                disabled={disabled}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  if (field.type === 'number') {
                    updateNumber(field, rawValue);
                  } else {
                    updateField(
                      field,
                      control === 'datetime'
                        ? normalizeDateTimeInput(rawValue)
                        : rawValue,
                    );
                  }
                }}
                onBlur={() => {
                  const rawDraft = numberDrafts[field.key];
                  if (control === 'number' && rawDraft && !isValidNumberInput(rawDraft)) {
                    setNumberErrors((current) => ({
                      ...current,
                      [field.key]: 'Enter a valid number.',
                    }));
                  }
                }}
                {...(field.required ? { required: true } : {})}
                {...(field.validation?.minLength !== undefined
                  ? { minLength: field.validation.minLength }
                  : {})}
                {...(field.validation?.maxLength !== undefined
                  ? { maxLength: field.validation.maxLength }
                  : {})}
                {...(field.validation?.pattern
                  ? { pattern: field.validation.pattern }
                  : {})}
                {...(control === 'number' && field.validation?.min !== undefined
                  ? { min: field.validation.min }
                  : {})}
                {...(control === 'number' && field.validation?.max !== undefined
                  ? { max: field.validation.max }
                  : {})}
                {...(control === 'number'
                  ? { step: field.validation?.integer ? 1 : 'any' }
                  : {})}
                placeholder={field.ui?.placeholder ?? ''}
                type={
                  control === 'number'
                    ? 'number'
                    : control === 'date'
                      ? 'date'
                      : control === 'datetime'
                        ? 'datetime-local'
                        : field.type === 'email'
                          ? 'email'
                          : field.type === 'url'
                            ? 'url'
                            : 'text'
                }
                value={
                  control === 'number'
                    ? (numberDrafts[field.key] ?? displayValue(value))
                    : control === 'date' || control === 'datetime'
                      ? dateInputValue(value, control)
                      : displayValue(value)
                }
              />
            )}
            {numberErrors[field.key] ? (
              <small className="alert-error-text" role="alert">
                {numberErrors[field.key]}
              </small>
            ) : null}
            {field.description ? (
              <small className="muted">{field.description}</small>
            ) : null}
            {field.ui?.helpText ? (
              <small className="muted">{field.ui.helpText}</small>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
