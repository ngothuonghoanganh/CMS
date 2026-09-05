'use client';

import {
  AssetListResponseSchema,
  AssetUsageResponseSchema,
  type Asset,
  type AssetUsageReference,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { assetPath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import {
  Drawer,
  EmptyState,
  Modal,
  PageHeader,
  PaginationControls,
  ResourceToolbar,
} from '../ui/surfaces';

type AssetForm = {
  filename: string;
  mimeType: string;
  size: string;
  storageKey: string;
  title: string;
  defaultAltText: string;
  description: string;
};
const blankAsset: AssetForm = {
  filename: '',
  mimeType: 'image/png',
  size: '0',
  storageKey: '/assets/',
  title: '',
  defaultAltText: '',
  description: '',
};

function isRenderableAssetSource(value: string): boolean {
  return value.startsWith('/assets/') || /^https?:\/\//i.test(value);
}

export default function AssetsPage({
  action,
  assetId,
}: {
  action?: 'create' | 'edit';
  assetId?: string;
}) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const requestId = useRef(0);
  const [form, setForm] = useState(blankAsset);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usages, setUsages] = useState<AssetUsageReference[]>([]);
  const [usagesTruncated, setUsagesTruncated] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Asset | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | undefined>();

  async function load(offset = 0) {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (search) params.set('search', search);
      if (mediaType) params.set('mediaType', mediaType);
      const response = await api.get(
        `/workspaces/${workspaceId}/assets?${params.toString()}`,
      );
      if (request !== requestId.current) return;
      const parsed = AssetListResponseSchema.parse(response);
      setAssets(parsed.items);
      setPagination(parsed.pagination);
    } catch (caughtError) {
      if (request !== requestId.current) return;
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to load assets.',
      );
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load(0);
  }, [mediaType, search, workspaceId]);

  useEffect(() => {
    if (!assetId) {
      setDetailAsset(undefined);
      return;
    }
    void api
      .get<Asset>(`/workspaces/${workspaceId}/assets/${assetId}`)
      .then(setDetailAsset)
      .catch(() => setDetailAsset(undefined));
  }, [assetId, workspaceId]);

  const selectedAsset = assets.find((asset) => asset.id === assetId) ?? detailAsset;
  useEffect(() => {
    if (!selectedAsset) return;
    setForm({
      filename: selectedAsset.filename,
      mimeType: selectedAsset.mimeType,
      size: String(selectedAsset.size),
      storageKey: selectedAsset.storageKey,
      title: selectedAsset.title ?? '',
      defaultAltText: selectedAsset.defaultAltText ?? '',
      description: selectedAsset.description ?? '',
    });
    void api
      .get(`/workspaces/${workspaceId}/assets/${selectedAsset.id}/usages`)
      .then((response) => {
        const parsed = AssetUsageResponseSchema.parse(response);
        setUsages(parsed.items);
        setUsagesTruncated(parsed.truncated);
      })
      .catch(() => {
        setUsages([]);
        setUsagesTruncated(false);
      });
  }, [selectedAsset, workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = {
        ...form,
        size: Number(form.size),
        title: form.title.trim() || undefined,
        defaultAltText: form.defaultAltText.trim() || undefined,
        description: form.description.trim() || undefined,
      };
      if (action === 'edit' && selectedAsset) {
        const updated = await api.patch<Asset>(
          `/workspaces/${workspaceId}/assets/${selectedAsset.id}`,
          {
            title: input.title ?? null,
            defaultAltText: input.defaultAltText ?? null,
            description: input.description ?? null,
          },
        );
        setAssets((current) =>
          current.map((asset) => (asset.id === updated.id ? updated : asset)),
        );
        router.replace(assetPath(workspaceId, updated.id));
      } else {
        const created = await api.post<Asset>(`/workspaces/${workspaceId}/assets`, input);
        setAssets((current) => [created, ...current]);
        router.replace(assetPath(workspaceId));
      }
      setForm(blankAsset);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to create asset.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(assetId: string) {
    setBusy(true);
    try {
      await api.delete(`/workspaces/${workspaceId}/assets/${assetId}`);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      if (assetId === selectedAsset?.id) router.replace(assetPath(workspaceId));
    } catch (caughtError) {
      if (caughtError instanceof ApiClientError && caughtError.code === 'ASSET_IN_USE') {
        setDeleteCandidate(null);
        setError(`${caughtError.message} Open the asset to review its usage references.`);
        router.push(assetPath(workspaceId, assetId));
        return;
      }
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to remove asset.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        actions={
          <button
            className="button button-primary"
            disabled={!can('asset.create')}
            onClick={() => router.push(`${assetPath(workspaceId)}/new`)}
            type="button"
          >
            Add asset
          </button>
        }
        description="Keep the files and media references used across this workspace in one place."
        eyebrow="Library"
        title="Assets"
      />
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <ResourceToolbar>
        <form
          className="inline-field asset-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchDraft.trim());
            setPagination((current) => ({ ...current, offset: 0 }));
          }}
        >
          <label htmlFor="asset-search">Search</label>
          <input
            id="asset-search"
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search filenames"
            value={searchDraft}
          />
          <button className="button button-small button-secondary" type="submit">
            Search
          </button>
        </form>
        <label className="inline-field">
          Media type
          <select
            aria-label="Filter assets by media type"
            onChange={(event) => {
              setMediaType(event.target.value);
              setPagination((current) => ({ ...current, offset: 0 }));
            }}
            value={mediaType}
          >
            <option value="">All media</option>
            <option value="image">Images</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
          </select>
        </label>
      </ResourceToolbar>
      <section className="panel">
        <div className="panel-heading">
          <h2>Asset inventory</h2>
          <span className="pill">{assets.length}</span>
        </div>
        {loading ? (
          <div aria-busy="true" className="analytics-skeleton">
            Loading assets…
          </div>
        ) : assets.length ? (
          <div className="list">
            {assets.map((asset) => (
              <div className="list-row" key={asset.id}>
                {asset.mimeType.toLowerCase().startsWith('image/') &&
                isRenderableAssetSource(asset.storageKey) ? (
                  <img
                    alt={asset.defaultAltText ?? asset.title ?? ''}
                    className="asset-library-thumbnail"
                    loading="lazy"
                    src={asset.storageKey}
                  />
                ) : (
                  <span aria-hidden="true" className="asset-library-file-icon">
                    {asset.mimeType.split('/')[0]?.toUpperCase() ?? 'FILE'}
                  </span>
                )}
                <div>
                  <strong>{asset.filename}</strong>
                  <span className="muted">
                    {asset.title || 'Untitled'} · {asset.mimeType} · {asset.size} bytes
                  </span>
                </div>
                <div className="form-actions">
                  <button
                    className="button button-small button-ghost"
                    onClick={() => router.push(assetPath(workspaceId, asset.id))}
                    type="button"
                  >
                    Edit metadata
                  </button>
                  <button
                    className="button button-small button-ghost"
                    disabled={!can('asset.delete') || busy}
                    onClick={() => setDeleteCandidate(asset)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <button
                className="button button-secondary"
                onClick={() => router.push(`${assetPath(workspaceId)}/new`)}
                type="button"
              >
                Add asset
              </button>
            }
            description="Add your first asset metadata record to start building the library."
            title="No assets yet"
          />
        )}
        {pagination.total ? (
          <PaginationControls
            busy={loading || busy}
            noun="assets"
            onNext={() => void load(pagination.offset + pagination.limit)}
            onPrevious={() =>
              void load(Math.max(0, pagination.offset - pagination.limit))
            }
            pagination={pagination}
          />
        ) : null}
      </section>
      <Modal
        description={
          deleteCandidate
            ? `Delete ${deleteCandidate.filename}? Referenced assets cannot be deleted.`
            : undefined
        }
        eyebrow="Destructive action"
        footer={
          <div className="form-actions">
            <button
              className="button button-ghost"
              onClick={() => setDeleteCandidate(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-danger"
              disabled={busy || !deleteCandidate}
              onClick={() => {
                if (!deleteCandidate) return;
                void remove(deleteCandidate.id);
                setDeleteCandidate(null);
              }}
              type="button"
            >
              Delete asset
            </button>
          </div>
        }
        onClose={() => setDeleteCandidate(null)}
        open={Boolean(deleteCandidate)}
        size="sm"
        title="Delete asset?"
      >
        <p>
          This removes only the metadata reference. Binary storage is managed outside this
          phase. If the asset is referenced, deletion will be blocked safely.
        </p>
      </Modal>
      {action ? (
        <Drawer
          description="Binary upload and processing are intentionally deferred; this records the asset reference used by the platform."
          footer={
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  (action === 'edit' ? !can('asset.update') : !can('asset.create'))
                }
                form="asset-form"
                type="submit"
              >
                {busy ? 'Saving…' : action === 'edit' ? 'Save metadata' : 'Add asset'}
              </button>
              <button
                className="button button-ghost"
                onClick={() => router.replace(assetPath(workspaceId))}
                type="button"
              >
                Cancel
              </button>
            </div>
          }
          onClose={() => router.replace(assetPath(workspaceId))}
          open
          title={action === 'edit' ? 'Edit asset metadata' : 'Add asset'}
        >
          <form
            className="stack"
            id="asset-form"
            onSubmit={(event) => void submit(event)}
          >
            <label>
              Filename
              <input
                onChange={(event) => setForm({ ...form, filename: event.target.value })}
                readOnly={action === 'edit'}
                required
                value={form.filename}
              />
            </label>
            <label>
              MIME type
              <input
                onChange={(event) => setForm({ ...form, mimeType: event.target.value })}
                readOnly={action === 'edit'}
                required
                value={form.mimeType}
              />
            </label>
            <label>
              Size in bytes
              <input
                min="0"
                onChange={(event) => setForm({ ...form, size: event.target.value })}
                readOnly={action === 'edit'}
                required
                type="number"
                value={form.size}
              />
            </label>
            <label>
              Storage key
              <input
                onChange={(event) => setForm({ ...form, storageKey: event.target.value })}
                readOnly={action === 'edit'}
                required
                value={form.storageKey}
              />
            </label>
            <label>
              Title
              <input
                disabled={action === 'edit' && !can('asset.update')}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                value={form.title}
              />
            </label>
            <label>
              Default alt text
              <input
                disabled={action === 'edit' && !can('asset.update')}
                onChange={(event) =>
                  setForm({ ...form, defaultAltText: event.target.value })
                }
                value={form.defaultAltText}
              />
            </label>
            <label>
              Description
              <textarea
                disabled={action === 'edit' && !can('asset.update')}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                rows={4}
                value={form.description}
              />
            </label>
            {action === 'edit' ? (
              <div className="panel panel-quiet">
                <strong>Usage summary</strong>
                {usages.length ? (
                  <div className="list">
                    {usages.map((usage) => (
                      <div
                        className="list-row"
                        key={`${usage.resourceType}:${usage.resourceId}`}
                      >
                        <span>{usage.label}</span>
                        <span className="muted small">
                          {usage.resourceType} · {usage.versionState ?? 'referenced'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted small">No references found.</span>
                )}
                {usagesTruncated ? (
                  <span className="muted small">Showing the first 100 references.</span>
                ) : null}
              </div>
            ) : null}
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
