'use client';

import type { AuditLog } from '@payload/contracts';

import { StatusBadge } from '../status-badge';
import { DataTable, EmptyState, PaginationControls } from '../ui/surfaces';

export function AuditView({
  auditLogs,
  pagination,
  actionFilter,
  resourceFilter,
  onPrevious,
  onNext,
  onFilter,
}: {
  auditLogs: AuditLog[];
  pagination: { limit: number; offset: number; total: number; hasNextPage: boolean };
  actionFilter: string;
  resourceFilter: string;
  onPrevious: () => void;
  onNext: () => void;
  onFilter: (filters: { action: string; resourceType: string }) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Security</span>
        <h1>Audit log</h1>
        <p className="muted">
          Append-only security and administration events for this tenant. Open a row for
          request context and metadata.
        </p>
      </div>
      <section className="panel page-toolbar-panel">
        <form
          className="filter-form"
          key={`${actionFilter}|${resourceFilter}`}
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            onFilter({
              action: String(formData.get('action') ?? '').trim(),
              resourceType: String(formData.get('resourceType') ?? '').trim(),
            });
          }}
        >
          <label className="inline-field">
            Action
            <input
              aria-label="Filter audit by action"
              name="action"
              placeholder="role.update"
              defaultValue={actionFilter}
            />
          </label>
          <label className="inline-field">
            Resource
            <input
              aria-label="Filter audit by resource"
              name="resourceType"
              placeholder="role, user, page"
              defaultValue={resourceFilter}
            />
          </label>
          <div className="form-actions">
            <button className="button button-secondary" type="submit">
              Apply filters
            </button>
            {actionFilter || resourceFilter ? (
              <button
                className="button button-ghost"
                onClick={() => onFilter({ action: '', resourceType: '' })}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <section className="panel">
        {auditLogs.length ? (
          <DataTable className="audit-table">
            <caption className="sr-only">Security and administration events</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Workspace</th>
                <th scope="col">Resource</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((entry) => (
                <AuditRow entry={entry} key={entry.id} />
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState
            description="Security events will appear here as workspace activity occurs."
            title="No audit events yet"
          />
        )}
        <PaginationControls
          noun="events"
          onNext={onNext}
          onPrevious={onPrevious}
          pagination={pagination}
        />
      </section>
    </>
  );
}

function AuditRow({ entry }: { entry: AuditLog }) {
  return (
    <>
      <tr>
        <td>
          <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
        </td>
        <td>
          <span className="table-primary">{entry.actorId}</span>
          <span className="table-secondary">{entry.actorType}</span>
        </td>
        <td>
          <span className="table-primary">{formatAction(entry.action)}</span>
          <span className="table-secondary">{entry.action}</span>
        </td>
        <td>{entry.workspaceId ? entry.workspaceId.slice(0, 8) : 'Tenant-wide'}</td>
        <td>
          <span className="table-primary">{entry.resourceType}</span>
          {entry.resourceId ? (
            <span className="table-secondary">{entry.resourceId.slice(0, 12)}</span>
          ) : null}
        </td>
        <td>
          <StatusBadge status={entry.result} />
        </td>
      </tr>
      <tr className="audit-detail-row">
        <td colSpan={6}>
          <details>
            <summary>View event details</summary>
            <div className="audit-detail-content">
              <span className="muted small">
                {entry.requestId
                  ? `Request ${entry.requestId}`
                  : 'No request id recorded'}
                {entry.ipAddress ? ` · IP ${entry.ipAddress}` : ''}
              </span>
              {entry.metadata ? (
                <pre className="code-block">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              ) : (
                <span className="muted small">No additional metadata recorded.</span>
              )}
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}

function formatAction(action: string): string {
  return action
    .split('.')
    .map((part) => part.replaceAll('-', ' '))
    .join(' · ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
