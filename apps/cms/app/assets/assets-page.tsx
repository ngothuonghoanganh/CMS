'use client';

import {
  AssetListResponseSchema,
  AssetFolderListResponseSchema,
  AssetUsageResponseSchema,
  type Asset,
  type AssetUsageReference,
  type AssetFolder,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

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
  folderId: string;
  title: string;
  defaultAltText: string;
  description: string;
};
type UploadItem = { file: File; state: 'queued' | 'uploading' | 'success' | 'error' };
const blankAsset: AssetForm = {
  filename: '',
  mimeType: 'image/png',
  size: '0',
  storageKey: '/assets/',
  folderId: '',
  title: '',
  defaultAltText: '',
  description: '',
};

function isRenderableAssetSource(value: string): boolean {
  return (
    value.startsWith('/assets/') ||
    value.startsWith('/api/') ||
    /^https?:\/\//i.test(value)
  );
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
  const [folderFilter, setFolderFilter] = useState('');
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
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);

  useEffect(() => {
    void api
      .get(`/workspaces/${workspaceId}/asset-folders`)
      .then((response) => setFolders(AssetFolderListResponseSchema.parse(response).items))
      .catch(() => setFolders([]));
  }, [workspaceId]);

  async function load(offset = 0) {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (search) params.set('search', search);
      if (mediaType) params.set('mediaType', mediaType);
      if (folderFilter) params.set('folderId', folderFilter);
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
  }, [folderFilter, mediaType, search, workspaceId]);

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
      folderId: selectedAsset.folderId ?? '',
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
            folderId: input.folderId || null,
          },
        );
        setAssets((current) =>
          current.map((asset) => (asset.id === updated.id ? updated : asset)),
        );
        router.replace(assetPath(workspaceId, updated.id));
      } else if (uploadItems.length) {
        for (const [index, item] of uploadItems.entries()) {
          setUploadItems((current) =>
            current.map((candidate, candidateIndex) =>
              candidateIndex === index ? { ...candidate, state: 'uploading' } : candidate,
            ),
          );
          const body = new FormData();
          body.append('file', item.file);
          if (input.title) body.append('title', input.title);
          if (input.defaultAltText) body.append('defaultAltText', input.defaultAltText);
          if (input.description) body.append('description', input.description);
          if (input.folderId) body.append('folderId', input.folderId);
          try {
            const created = await api.upload<Asset>(
              `/workspaces/${workspaceId}/assets/upload`,
              body,
            );
            setAssets((current) => [created, ...current]);
            setUploadItems((current) =>
              current.map((candidate, candidateIndex) =>
                candidateIndex === index ? { ...candidate, state: 'success' } : candidate,
              ),
            );
          } catch (caughtError) {
            setUploadItems((current) =>
              current.map((candidate, candidateIndex) =>
                candidateIndex === index ? { ...candidate, state: 'error' } : candidate,
              ),
            );
            throw caughtError;
          }
        }
        setUploadItems([]);
        router.replace(assetPath(workspaceId));
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

  function chooseUploadFiles(files: FileList | readonly File[]): void {
    const nextFiles = Array.from(files);
    setUploadItems(nextFiles.map((file) => ({ file, state: 'queued' })));
    const first = nextFiles[0];
    if (first) {
      setForm((current) => ({
        ...current,
        filename: first.name,
        mimeType: first.type || current.mimeType,
        size: String(first.size),
      }));
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

  async function createFolder(parentId?: string) {
    const name = window.prompt(parentId ? 'Child folder name' : 'Folder name');
    if (!name?.trim()) return;
    try {
      const folder = await api.post<AssetFolder>(
        `/workspaces/${workspaceId}/asset-folders`,
        { name: name.trim(), ...(parentId ? { parentId } : {}) },
      );
      setFolders((current) => [...current, folder]);
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to create folder.',
      );
    }
  }

  async function renameFolder(folder: AssetFolder) {
    const name = window.prompt('Folder name', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      const updated = await api.patch<AssetFolder>(
        `/workspaces/${workspaceId}/asset-folders/${folder.id}`,
        { name: name.trim() },
      );
      setFolders((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to rename folder.',
      );
    }
  }

  async function removeFolder(folder: AssetFolder) {
    if (!window.confirm(`Delete the ${folder.name} folder? Contents are never deleted.`))
      return;
    try {
      await api.delete(`/workspaces/${workspaceId}/asset-folders/${folder.id}`);
      setFolders((current) => current.filter((candidate) => candidate.id !== folder.id));
      if (folderFilter === folder.id) setFolderFilter('');
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to remove folder. Move its contents first.',
      );
    }
  }

  function renderFolderTree(parentId?: string, depth = 0): ReactNode[] {
    return folders
      .filter((folder) => (folder.parentId ?? undefined) === parentId)
      .map((folder) => (
        <div key={folder.id}>
          <div className="asset-folder-row" style={{ paddingLeft: `${depth * 0.9}rem` }}>
            <button
              className={`asset-folder-select${folderFilter === folder.id ? ' is-active' : ''}`}
              onClick={() => setFolderFilter(folder.id)}
              type="button"
            >
              <span aria-hidden="true">▰</span>
              {folder.name}
            </button>
            {can('asset.create') ? (
              <button
                aria-label={`Add child folder to ${folder.name}`}
                className="button button-small button-ghost"
                onClick={() => void createFolder(folder.id)}
                type="button"
              >
                +
              </button>
            ) : null}
            {can('asset.update') ? (
              <button
                aria-label={`Rename ${folder.name}`}
                className="button button-small button-ghost"
                onClick={() => void renameFolder(folder)}
                type="button"
              >
                Rename
              </button>
            ) : null}
            {can('asset.delete') ? (
              <button
                aria-label={`Delete ${folder.name}`}
                className="button button-small button-ghost"
                onClick={() => void removeFolder(folder)}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
          {renderFolderTree(folder.id, depth + 1)}
        </div>
      ));
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
      <div className="asset-library-layout">
        <aside className="panel asset-folder-panel">
          <div className="panel-heading">
            <div>
              <h2>Folders</h2>
              <span className="muted small">Organize workspace media</span>
            </div>
            {can('asset.create') ? (
              <button
                className="button button-small button-secondary"
                onClick={() => void createFolder()}
                type="button"
              >
                New
              </button>
            ) : null}
          </div>
          <button
            className={`asset-folder-select${!folderFilter ? ' is-active' : ''}`}
            onClick={() => setFolderFilter('')}
            type="button"
          >
            <span aria-hidden="true">▦</span>
            All assets
          </button>
          {renderFolderTree()}
          {!folders.length ? (
            <p className="muted small">
              Create a folder to keep campaigns and brand files together.
            </p>
          ) : null}
        </aside>
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
                  isRenderableAssetSource(asset.publicUrl ?? asset.storageKey) ? (
                    <img
                      alt={asset.defaultAltText ?? asset.title ?? ''}
                      className="asset-library-thumbnail"
                      loading="lazy"
                      src={asset.publicUrl ?? asset.storageKey}
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
      </div>
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
          This removes the metadata and stored binary. If the asset is referenced,
          deletion is blocked safely and the usage locations remain available for review.
        </p>
      </Modal>
      {action ? (
        <Drawer
          description="Upload media once, organize it into folders, and reuse the stable asset reference across the workspace."
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
            {action === 'create' ? (
              <div
                className="asset-upload-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseUploadFiles(event.dataTransfer.files);
                }}
              >
                <label>
                  File upload
                  <input
                    accept="image/*,video/*,audio/*,application/*,text/*"
                    multiple
                    onChange={(event) => {
                      chooseUploadFiles(event.target.files ?? []);
                      event.target.value = '';
                    }}
                    type="file"
                  />
                  <small className="muted">
                    Choose files or drag them here. Each file is checked and uploaded
                    separately, up to 25 MB. Metadata-only records remain available for
                    legacy storage references.
                  </small>
                </label>
                {uploadItems.length ? (
                  <ul className="asset-upload-queue">
                    {uploadItems.map((item, index) => (
                      <li key={`${item.file.name}-${item.file.lastModified}-${index}`}>
                        <span>{item.file.name}</span>
                        <span className="muted small">{item.state}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <label>
              Filename
              <input
                onChange={(event) => setForm({ ...form, filename: event.target.value })}
                readOnly={action === 'edit'}
                required={!uploadItems.length}
                value={form.filename}
              />
            </label>
            <label>
              MIME type
              <input
                onChange={(event) => setForm({ ...form, mimeType: event.target.value })}
                readOnly={action === 'edit'}
                required={!uploadItems.length}
                value={form.mimeType}
              />
            </label>
            <label>
              Size in bytes
              <input
                min="0"
                onChange={(event) => setForm({ ...form, size: event.target.value })}
                readOnly={action === 'edit'}
                required={!uploadItems.length}
                type="number"
                value={form.size}
              />
            </label>
            <label>
              Storage key
              <input
                onChange={(event) => setForm({ ...form, storageKey: event.target.value })}
                readOnly={action === 'edit'}
                required={!uploadItems.length}
                value={form.storageKey}
              />
            </label>
            <label>
              Folder
              <select
                onChange={(event) => setForm({ ...form, folderId: event.target.value })}
                value={form.folderId}
              >
                <option value="">Unfiled</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
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
