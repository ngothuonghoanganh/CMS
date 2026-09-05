'use client';

import { AssetListResponseSchema, type Asset } from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { cmsViewPath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import { Drawer, EmptyState, PageHeader } from '../ui/surfaces';

type AssetForm = { filename: string; mimeType: string; size: string; storageKey: string };
const blankAsset: AssetForm = {
  filename: '',
  mimeType: 'image/png',
  size: '0',
  storageKey: '/assets/',
};

export default function AssetsPage({ action }: { action?: 'create' }) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState(blankAsset);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get(`/workspaces/${workspaceId}/assets?limit=100`);
      setAssets(AssetListResponseSchema.parse(response).items);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to load assets.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Asset>(`/workspaces/${workspaceId}/assets`, {
        ...form,
        size: Number(form.size),
      });
      setAssets((current) => [created, ...current]);
      setForm(blankAsset);
      router.replace(cmsViewPath(workspaceId, 'assets'));
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
    } catch (caughtError) {
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
            onClick={() => router.push(`${cmsViewPath(workspaceId, 'assets')}/new`)}
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
                <div>
                  <strong>{asset.filename}</strong>
                  <span className="muted">
                    {asset.mimeType} · {asset.size} bytes
                  </span>
                </div>
                <button
                  className="button button-small button-ghost"
                  disabled={!can('asset.delete') || busy}
                  onClick={() => void remove(asset.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <button
                className="button button-secondary"
                onClick={() => router.push(`${cmsViewPath(workspaceId, 'assets')}/new`)}
                type="button"
              >
                Add asset
              </button>
            }
            description="Add your first asset metadata record to start building the library."
            title="No assets yet"
          />
        )}
      </section>
      {action ? (
        <Drawer
          description="Binary upload and processing are intentionally deferred; this records the asset reference used by the platform."
          footer={
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={busy}
                form="asset-form"
                type="submit"
              >
                {busy ? 'Saving…' : 'Add asset'}
              </button>
              <button
                className="button button-ghost"
                onClick={() => router.replace(cmsViewPath(workspaceId, 'assets'))}
                type="button"
              >
                Cancel
              </button>
            </div>
          }
          onClose={() => router.replace(cmsViewPath(workspaceId, 'assets'))}
          open
          title="Add asset"
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
                required
                value={form.filename}
              />
            </label>
            <label>
              MIME type
              <input
                onChange={(event) => setForm({ ...form, mimeType: event.target.value })}
                required
                value={form.mimeType}
              />
            </label>
            <label>
              Size in bytes
              <input
                min="0"
                onChange={(event) => setForm({ ...form, size: event.target.value })}
                required
                type="number"
                value={form.size}
              />
            </label>
            <label>
              Storage key
              <input
                onChange={(event) => setForm({ ...form, storageKey: event.target.value })}
                required
                value={form.storageKey}
              />
            </label>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
