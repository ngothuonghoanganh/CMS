'use client';

import {
  TemplateListResponseSchema,
  TemplateVersionsResponseSchema,
  type Template,
  type TemplateVersion,
} from '@payload/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useCmsShell } from '../cms-shell';
import { cmsViewPath, pagesPath, templatePath } from '../cms-routes';
import { ApiClientError, api } from '../lib/api';
import { EmptyState, Drawer, PageHeader } from '../ui/surfaces';

type TemplateForm = { name: string; description: string };
const blankTemplate: TemplateForm = { name: '', description: '' };

function defaultPayload(title: string) {
  return {
    metadata: { documentTitle: title },
    root: { children: [], id: 'root', props: {}, type: 'root' as const },
    version: 1 as const,
  };
}

export default function TemplatesPage({
  action,
  templateId,
  siteId,
}: {
  action?: 'create' | 'edit';
  templateId?: string;
  siteId?: string;
}) {
  const router = useRouter();
  const { workspaceId, can } = useCmsShell();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(blankTemplate);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, TemplateVersion[]>>({});

  async function load() {
    setLoading(true);
    try {
      const response = await api.get(`/workspaces/${workspaceId}/templates?limit=100`);
      const items = TemplateListResponseSchema.parse(response).items;
      setTemplates(items);
      const template = items.find((item) => item.id === templateId);
      if (template)
        setForm({ name: template.name, description: template.description ?? '' });
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to load templates.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [templateId, workspaceId]);
  useEffect(() => {
    if (action === 'create') setForm(blankTemplate);
  }, [action]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const base = `/workspaces/${workspaceId}/templates`;
      if (action === 'edit' && templateId) {
        const updated = await api.patch<Template>(`${base}/${templateId}`, form);
        setTemplates((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        router.replace(templatePath(workspaceId, updated.id));
      } else {
        const created = await api.post<Template>(base, {
          ...form,
          ...(siteId ? { siteId } : {}),
          payload: defaultPayload(form.name),
        });
        setTemplates((current) => [created, ...current]);
        router.replace(templatePath(workspaceId, created.id));
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to save template.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(template: Template) {
    if (!window.confirm(`Remove ${template.name}?`)) return;
    setBusy(true);
    try {
      await api.delete(`/workspaces/${workspaceId}/templates/${template.id}`);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to remove template.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function publish(template: Template) {
    setBusy(true);
    try {
      const updated = await api.post<Template>(
        `/workspaces/${workspaceId}/templates/${template.id}/publish`,
        {},
      );
      setTemplates((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to publish template.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function loadVersions(template: Template) {
    if (versions[template.id]) {
      setVersions((current) => {
        const next = { ...current };
        delete next[template.id];
        return next;
      });
      return;
    }
    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/templates/${template.id}/versions`,
      );
      setVersions((current) => ({
        ...current,
        [template.id]: TemplateVersionsResponseSchema.parse(response).items,
      }));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to load template versions.',
      );
    }
  }

  const selected = templates.find((template) => template.id === templateId);
  return (
    <>
      {selected && !action ? (
        <TemplateDetail
          canUpdate={can('template.update')}
          template={selected}
          workspaceId={workspaceId}
          {...(siteId ? { siteId } : {})}
        />
      ) : (
        <>
          <PageHeader
            actions={
              <button
                className="button button-primary"
                disabled={!can('template.create')}
                onClick={() =>
                  router.push(`${cmsViewPath(workspaceId, 'templates')}/new`)
                }
                type="button"
              >
                New template
              </button>
            }
            description="Manage reusable page starting points and their published versions."
            eyebrow="Library"
            title="Templates"
          />
          {error ? (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          ) : null}
          <section className="panel">
            <div className="panel-heading">
              <h2>Template inventory</h2>
              <span className="pill">{templates.length}</span>
            </div>
            {loading ? (
              <div aria-busy="true" className="analytics-skeleton">
                Loading templates…
              </div>
            ) : templates.length ? (
              <div className="list">
                {templates.map((template) => (
                  <div className="list-row" key={template.id}>
                    <div>
                      <a
                        className="text-link resource-name-link"
                        href={templatePath(workspaceId, template.id)}
                      >
                        {template.name}
                      </a>
                      <span className="muted">
                        {template.description || 'No description'}
                      </span>
                      <span className="muted small">
                        {template.publishedVersionId ? 'Published' : 'Draft only'}
                      </span>
                      <button
                        className="text-link"
                        onClick={() => void loadVersions(template)}
                        type="button"
                      >
                        {versions[template.id]
                          ? 'Hide version history'
                          : 'Version history'}
                      </button>
                      {versions[template.id]?.map((version) => (
                        <span className="muted small" key={version.id}>
                          v{version.versionNumber}
                          {version.id === template.publishedVersionId ? ' · live' : ''}
                        </span>
                      ))}
                    </div>
                    <div className="row-actions">
                      <button
                        className="button button-small button-primary"
                        onClick={() =>
                          router.push(
                            `${pagesPath(workspaceId, siteId)}/new?templateId=${encodeURIComponent(template.id)}`,
                          )
                        }
                        type="button"
                      >
                        Use for page
                      </button>
                      <button
                        className="button button-small button-secondary"
                        disabled={!siteId || !can('template.update')}
                        onClick={() =>
                          siteId &&
                          router.push(
                            `/workspaces/${workspaceId}/sites/${siteId}/templates/${template.id}/builder`,
                          )
                        }
                        type="button"
                      >
                        Open builder
                      </button>
                      <button
                        className="button button-small"
                        disabled={!can('template.update')}
                        onClick={() =>
                          router.push(templatePath(workspaceId, template.id, 'edit'))
                        }
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="button button-small button-success"
                        disabled={busy || !can('template.publish')}
                        onClick={() => void publish(template)}
                        type="button"
                      >
                        Publish
                      </button>
                      <button
                        className="button button-small button-danger"
                        disabled={!can('template.delete')}
                        onClick={() => void remove(template)}
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
                    onClick={() =>
                      router.push(`${cmsViewPath(workspaceId, 'templates')}/new`)
                    }
                    type="button"
                  >
                    New template
                  </button>
                }
                description="Create a template metadata record to get started."
                title="No templates"
              />
            )}
          </section>
        </>
      )}
      {action ? (
        <Drawer
          description="Templates save a reusable page snapshot. You can open the visual builder after creating it."
          footer={
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={
                  busy || (templateId ? !can('template.update') : !can('template.create'))
                }
                form="template-form"
                type="submit"
              >
                {busy ? 'Saving…' : templateId ? 'Save metadata' : 'Create template'}
              </button>
              <button
                className="button button-ghost"
                onClick={() => router.replace(cmsViewPath(workspaceId, 'templates'))}
                type="button"
              >
                Cancel
              </button>
            </div>
          }
          onClose={() => router.replace(cmsViewPath(workspaceId, 'templates'))}
          open
          title={templateId ? 'Edit template' : 'New template'}
        >
          <form
            className="stack"
            id="template-form"
            onSubmit={(event) => void submit(event)}
          >
            <label>
              Template name
              <input
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label>
              Description
              <textarea
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                rows={3}
                value={form.description}
              />
            </label>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}

function TemplateDetail({
  template,
  canUpdate,
  siteId,
  workspaceId,
}: {
  template: Template;
  canUpdate: boolean;
  siteId?: string;
  workspaceId: string;
}) {
  const router = useRouter();
  return (
    <>
      <PageHeader
        actions={
          <div className="form-actions">
            <button
              className="button button-secondary"
              disabled={!canUpdate || !siteId}
              onClick={() =>
                siteId &&
                router.push(
                  `/workspaces/${workspaceId}/sites/${siteId}/templates/${template.id}/builder`,
                )
              }
              type="button"
            >
              Open builder
            </button>
            <button
              className="button button-primary"
              disabled={!canUpdate}
              onClick={() => router.push(templatePath(workspaceId, template.id, 'edit'))}
              type="button"
            >
              Edit template
            </button>
          </div>
        }
        description={template.description || 'Reusable starting point for new pages.'}
        eyebrow="Template"
        title={template.name}
      />
      <section className="panel template-detail-panel">
        <div className="template-detail-summary">
          <div>
            <span className="eyebrow">Status</span>
            <strong>{template.publishedVersionId ? 'Published' : 'Draft only'}</strong>
          </div>
          <div>
            <span className="eyebrow">Updated</span>
            <span>{new Date(template.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
        <button
          className="button button-secondary"
          onClick={() =>
            router.push(
              `${pagesPath(workspaceId, siteId)}/new?templateId=${encodeURIComponent(template.id)}`,
            )
          }
          type="button"
        >
          Use for page
        </button>
      </section>
    </>
  );
}
