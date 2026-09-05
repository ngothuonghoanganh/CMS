'use client';

import {
  CollectionEntryListResponseSchema,
  type Asset,
  type Collection,
  type CollectionEntryResponse,
  type CollectionFieldType,
} from '@payload/contracts';
import { useEffect, useMemo, useState } from 'react';

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

function dateInputValue(value: unknown, type: 'date' | 'datetime'): string {
  const string = displayValue(value);
  if (!string) return '';
  return type === 'date' ? string.slice(0, 10) : string.slice(0, 16);
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
  assets,
  error,
  loading = false,
  onChange,
  onRemove,
  value,
  disabled = false,
}: {
  assets: readonly Asset[];
  disabled?: boolean;
  error?: string | undefined;
  loading?: boolean;
  onChange: (assetId: string) => void;
  onRemove: () => void;
  value: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mediaType, setMediaType] = useState<
    'all' | 'image' | 'video' | 'audio' | 'document'
  >('all');
  const selectedValue = isString(value) ? value : '';
  const selectedAsset = assets.find(
    (asset) => asset.id === selectedValue || asset.storageKey === selectedValue,
  );
  const visibleAssets = useMemo(
    () => filterAssets(assets, search, mediaType),
    [assets, mediaType, search],
  );

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
      ) : selectedValue ? (
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
      {error ? (
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filename or media type"
            value={search}
          />
          <label className="inline-field">
            Media type
            <select
              aria-label="Filter assets by media type"
              onChange={(event) => setMediaType(event.target.value as typeof mediaType)}
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
          <div className="collection-picker-state">
            {error ?? (assets.length ? 'No matching assets.' : 'No assets available.')}
          </div>
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
  const ids = referenceIds(value, cardinality);
  const selectedIdSet = useMemo(() => new Set(ids), [ids]);
  const idKey = ids.join('|');
  const collectionPath = collection
    ? `/workspaces/${workspaceId}/sites/${siteId}/collections/${collection.id}/entries`
    : '';

  useEffect(() => {
    if (!open || !collectionPath) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void api
        .get<unknown>(
          `${collectionPath}?limit=50&offset=0${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`,
        )
        .then((response) => {
          if (!active) return;
          const parsed = CollectionEntryListResponseSchema.parse(response);
          setItems(parsed.items.filter((entry) => entry.status !== 'archived'));
        })
        .catch((caughtError: unknown) => {
          if (active)
            setError(
              caughtError instanceof ApiClientError
                ? caughtError.message
                : 'Unable to load reference entries.',
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [collectionPath, open, search]);

  useEffect(() => {
    if (!open || !collectionPath) return;
    const missingIds = ids.filter(
      (id) =>
        !items.some((entry) => entry.id === id) &&
        !selectedItems.some((entry) => entry.id === id),
    );
    if (missingIds.length === 0) return;
    let active = true;
    void Promise.all(
      missingIds
        .slice(0, 20)
        .map((id) =>
          api.get<CollectionEntryResponse>(`${collectionPath}/${id}`).catch(() => null),
        ),
    ).then((resolved) => {
      if (!active) return;
      const available = resolved.filter((entry): entry is CollectionEntryResponse =>
        Boolean(entry),
      );
      setSelectedItems((current) => [
        ...current.filter((entry) => ids.includes(entry.id)),
        ...available.filter((entry) => !current.some((item) => item.id === entry.id)),
      ]);
    });
    return () => {
      active = false;
    };
  }, [collectionPath, idKey, items, open, selectedItems]);

  const allKnownItems = [...selectedItems, ...items].filter(
    (entry, index, all) =>
      all.findIndex((candidate) => candidate.id === entry.id) === index,
  );
  const selectedLabels = ids.map((id) => {
    const entry = allKnownItems.find((candidate) => candidate.id === id);
    return entry && collection ? entryTitle(entry, collection) : 'Unavailable reference';
  });

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
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${collection.singularName.toLowerCase()} entries`}
          value={search}
        />
        {loading ? (
          <div aria-busy="true" className="collection-picker-state">
            Loading entries…
          </div>
        ) : allKnownItems.length === 0 ? (
          <div className="collection-picker-state">{error ?? 'No entries found.'}</div>
        ) : (
          <div className="collection-picker-list">
            {allKnownItems.map((entry) => {
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
      </Modal>
    </div>
  );
}

export function CollectionEntryFields({
  assets,
  assetError,
  assetsLoading,
  collection,
  collections,
  disabled = false,
  entryValues,
  onChange,
  siteId,
  workspaceId,
}: {
  assets: readonly Asset[];
  assetError?: string | undefined;
  assetsLoading: boolean;
  collection: Collection;
  collections: readonly Collection[];
  disabled?: boolean;
  entryValues: string;
  onChange: (value: string) => void;
  siteId: string;
  workspaceId: string;
}) {
  let values: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(entryValues) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      values = parsed as Record<string, unknown>;
  } catch {
    // The advanced editor owns malformed text until submit validation reports it.
  }

  const updateField = (field: Collection['fields'][number], value: unknown) => {
    const nextValues = { ...values };
    if (value === '' || value === undefined) {
      if (!field.required) delete nextValues[field.key];
      else nextValues[field.key] = value;
    } else {
      nextValues[field.key] = value;
    }
    onChange(JSON.stringify(nextValues, null, 2));
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
          const selectedAssetValue =
            field.type === 'image' &&
            isString(value) &&
            !isEntityId(value) &&
            !assets.some((asset) => asset.id === value || asset.storageKey === value)
              ? undefined
              : value;
          return (
            <div className="collection-entry-field" key={field.id}>
              {label}
              <AssetPicker
                assets={assets}
                disabled={disabled}
                error={assetError}
                loading={assetsLoading}
                onChange={(assetId) => updateField(field, assetId)}
                onRemove={() => updateField(field, undefined)}
                value={selectedAssetValue}
              />
              {field.type === 'image' ? (
                <label>
                  Or use an image URL
                  <input
                    disabled={disabled}
                    onChange={(event) => updateField(field, event.target.value)}
                    placeholder="https://… or /assets/…"
                    type="url"
                    value={
                      typeof value === 'string' &&
                      !isEntityId(value) &&
                      !assets.some(
                        (asset) => asset.id === value || asset.storageKey === value,
                      )
                        ? value
                        : ''
                    }
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
            <div
              className="collection-entry-field collection-structured-note"
              key={field.id}
            >
              {label}
              <span className="muted small">
                Configure this structured value in Advanced JSON below.
              </span>
            </div>
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
                  updateField(
                    field,
                    field.type === 'number' && rawValue !== ''
                      ? Number(rawValue)
                      : rawValue,
                  );
                }}
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
                  control === 'date' || control === 'datetime'
                    ? dateInputValue(value, control)
                    : displayValue(value)
                }
              />
            )}
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
