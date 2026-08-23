'use client';

import {
  IntegrationDeliveryListResponseSchema,
  IntegrationListResponseSchema,
  IntegrationSchema,
  type Integration,
  type IntegrationDelivery,
} from '@payload/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from './lib/api';

type IntegrationType = 'email' | 'webhook';
type IntegrationForm = {
  type: IntegrationType;
  name: string;
  enabled: boolean;
  recipients: string;
  subjectTemplate: string;
  url: string;
  secret: string;
  clearSecret: boolean;
};

const blankForm: IntegrationForm = {
  type: 'email',
  name: '',
  enabled: true,
  recipients: '',
  subjectTemplate: 'New submission from {{pageTitle}}',
  url: 'https://',
  secret: '',
  clearSecret: false,
};

export function IntegrationsView({
  workspaceId,
  initialIntegrations,
  onIntegrationsChanged,
}: {
  workspaceId: string;
  initialIntegrations: Integration[];
  onIntegrationsChanged: (items: Integration[]) => void;
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [deliveries, setDeliveries] = useState<IntegrationDelivery[]>([]);
  const [form, setForm] = useState<IntegrationForm>(blankForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setIntegrations(initialIntegrations);
  }, [initialIntegrations]);

  useEffect(() => {
    void refresh();
  }, [workspaceId]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [integrationResponse, deliveryResponse] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/integrations?limit=100`),
        api.get('/integration-deliveries?limit=50'),
      ]);
      const nextIntegrations =
        IntegrationListResponseSchema.parse(integrationResponse).items;
      setIntegrations(nextIntegrations);
      onIntegrationsChanged(nextIntegrations);
      setDeliveries(IntegrationDeliveryListResponseSchema.parse(deliveryResponse).items);
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const config =
        form.type === 'email'
          ? {
              recipients: form.recipients
                .split(',')
                .map((recipient) => recipient.trim())
                .filter(Boolean),
              subjectTemplate: form.subjectTemplate,
            }
          : { url: form.url, eventType: 'form.submitted' as const };
      const input = {
        ...(editingId ? {} : { type: form.type }),
        name: form.name,
        enabled: form.enabled,
        config,
        ...(form.secret ? { secret: form.secret } : {}),
        ...(editingId && form.clearSecret ? { clearSecret: true } : {}),
      };
      const response = editingId
        ? await api.patch(`/workspaces/${workspaceId}/integrations/${editingId}`, input)
        : await api.post(`/workspaces/${workspaceId}/integrations`, input);
      const saved = IntegrationSchema.parse(response);
      const next = editingId
        ? integrations.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...integrations];
      setIntegrations(next);
      onIntegrationsChanged(next);
      setForm(blankForm);
      setEditingId('');
      setNotice(editingId ? 'Integration updated.' : 'Integration created.');
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(integration: Integration) {
    if (!window.confirm(`Remove ${integration.name}?`)) return;
    setError(null);
    try {
      await api.delete(`/workspaces/${workspaceId}/integrations/${integration.id}`);
      const next = integrations.filter((item) => item.id !== integration.id);
      setIntegrations(next);
      onIntegrationsChanged(next);
      setNotice('Integration removed.');
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    }
  }

  async function retry(delivery: IntegrationDelivery) {
    setRetryingId(delivery.id);
    setError(null);
    try {
      await api.post(`/integration-deliveries/${delivery.id}/retry`);
      setNotice('Delivery queued for retry.');
      await refresh();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setRetryingId('');
    }
  }

  function edit(integration: Integration) {
    if (integration.config.type === 'email') {
      setForm({
        ...blankForm,
        type: 'email',
        name: integration.name,
        enabled: integration.enabled,
        recipients: integration.config.recipients.join(', '),
        subjectTemplate: integration.config.subjectTemplate,
      });
    } else {
      setForm({
        ...blankForm,
        type: 'webhook',
        name: integration.name,
        enabled: integration.enabled,
        url: integration.config.url,
      });
    }
    setEditingId(integration.id);
    setNotice(null);
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Connected services</span>
        <h1>Integrations</h1>
        <p className="muted">
          Configure workspace notifications and inspect durable delivery attempts. Secrets
          are never shown after they are saved.
        </p>
      </div>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}
      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <h2>{editingId ? 'Edit integration' : 'Create integration'}</h2>
          </div>
          <form className="stack" onSubmit={save}>
            {!editingId ? (
              <label>
                Type
                <select
                  onChange={(event) =>
                    setForm({ ...form, type: event.target.value as IntegrationType })
                  }
                  value={form.type}
                >
                  <option value="email">Email notification</option>
                  <option value="webhook">Webhook</option>
                </select>
              </label>
            ) : null}
            <label>
              Name
              <input
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                value={form.name}
              />
            </label>
            <label className="checkbox-field">
              <input
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                type="checkbox"
              />
              Enabled
            </label>
            {form.type === 'email' ? (
              <>
                <label>
                  Recipients <span className="muted">(comma separated)</span>
                  <input
                    onChange={(event) =>
                      setForm({ ...form, recipients: event.target.value })
                    }
                    placeholder="sales@example.com"
                    required
                    value={form.recipients}
                  />
                </label>
                <label>
                  Subject template
                  <input
                    onChange={(event) =>
                      setForm({ ...form, subjectTemplate: event.target.value })
                    }
                    required
                    value={form.subjectTemplate}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  HTTPS URL
                  <input
                    onChange={(event) => setForm({ ...form, url: event.target.value })}
                    placeholder="https://hooks.example.com/payload"
                    required
                    type="url"
                    value={form.url}
                  />
                </label>
                <label>
                  Signing secret <span className="muted">(optional)</span>
                  <input
                    onChange={(event) =>
                      setForm({ ...form, secret: event.target.value, clearSecret: false })
                    }
                    placeholder={
                      editingId ? 'Secret configured' : 'Enter once; never displayed'
                    }
                    type="password"
                    value={form.secret}
                  />
                </label>
                {editingId ? (
                  <label className="checkbox-field">
                    <input
                      checked={form.clearSecret}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          clearSecret: event.target.checked,
                          secret: '',
                        })
                      }
                      type="checkbox"
                    />
                    Remove configured secret
                  </label>
                ) : null}
              </>
            )}
            <div className="form-actions">
              <button className="button button-primary" disabled={saving} type="submit">
                {saving
                  ? 'Saving…'
                  : editingId
                    ? 'Save integration'
                    : 'Create integration'}
              </button>
              {editingId ? (
                <button
                  className="button button-ghost"
                  onClick={() => {
                    setEditingId('');
                    setForm(blankForm);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Workspace integrations</h2>
            <span className="pill">{integrations.length}</span>
          </div>
          {loading ? (
            <p className="muted" aria-busy="true">
              Loading integrations…
            </p>
          ) : integrations.length ? (
            <div className="list">
              {integrations.map((integration) => (
                <div className="list-row" key={integration.id}>
                  <div>
                    <strong>{integration.name}</strong>
                    <span className="muted">
                      {integration.config.type === 'email'
                        ? integration.config.recipients.join(', ')
                        : `${integration.config.url} · ${integration.config.secretConfigured ? 'Secret configured' : 'Unsigned'}`}
                    </span>
                  </div>
                  <div className="row-actions">
                    <span className="pill">
                      {integration.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      className="button button-small"
                      onClick={() => edit(integration)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="button button-small button-danger"
                      onClick={() => void remove(integration)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No integrations configured</strong>
              <span className="muted">
                Create an email notification or webhook to connect a form.
              </span>
            </div>
          )}
        </section>
      </div>
      <section className="panel" aria-label="Integration delivery logs">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Reliability</span>
            <h2>Delivery logs</h2>
          </div>
          <button
            className="button button-ghost button-small"
            onClick={() => void refresh()}
            type="button"
          >
            Refresh
          </button>
        </div>
        {deliveries.length ? (
          <div className="list">
            {deliveries.map((delivery) => (
              <div className="list-row" key={delivery.id}>
                <div>
                  <strong>{delivery.integrationName}</strong>
                  <span className="muted">
                    {delivery.integrationType} · submission{' '}
                    {delivery.submissionId.slice(0, 8)} · {delivery.attemptCount} attempt
                    {delivery.attemptCount === 1 ? '' : 's'}
                  </span>
                  {delivery.lastError ? (
                    <span className="delivery-error">{delivery.lastError}</span>
                  ) : null}
                </div>
                <div className="row-actions">
                  <span className="pill">{delivery.status}</span>
                  {delivery.status === 'failed' ? (
                    <button
                      className="button button-small"
                      disabled={retryingId === delivery.id}
                      onClick={() => void retry(delivery)}
                      type="button"
                    >
                      {retryingId === delivery.id ? 'Retrying…' : 'Retry'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No delivery attempts yet</strong>
            <span className="muted">
              Attach an integration to a form and submit a published page.
            </span>
          </div>
        )}
      </section>
    </>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The integration request failed.';
}
