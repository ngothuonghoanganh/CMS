'use client';

import { SubmissionListResponseSchema, type FormSubmission } from '@payload/contracts';
import { useEffect, useRef, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { StatusBadge } from '../status-badge';
import {
  Drawer,
  EmptyState,
  PageHeader,
  PaginationControls,
  ResourceToolbar,
} from '../ui/surfaces';

export default function SubmissionsPage() {
  const { workspaceId } = useCmsShell();
  const [items, setItems] = useState<FormSubmission[]>([]);
  const [selected, setSelected] = useState<FormSubmission | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const params = new URLSearchParams({ limit: '20', offset: String(page.offset) });
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    void api
      .get(`/submissions?${params.toString()}`)
      .then((response) => {
        if (id !== requestId.current) return;
        const parsed = SubmissionListResponseSchema.parse(response);
        setItems(parsed.items);
        setPage(parsed.pagination);
        setSelected((current) =>
          current && parsed.items.some((item) => item.id === current.id) ? current : null,
        );
      })
      .catch((caughtError: unknown) => {
        if (id === requestId.current)
          setError(
            caughtError instanceof ApiClientError
              ? caughtError.message
              : 'Unable to load submissions.',
          );
      });
  }, [page.offset, search, status, workspaceId]);

  async function updateStatus(
    submission: FormSubmission,
    nextStatus: FormSubmission['status'],
  ) {
    try {
      const updated = await api.patch<FormSubmission>(`/submissions/${submission.id}`, {
        status: nextStatus,
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected(updated);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to update submission.',
      );
    }
  }

  return (
    <>
      <PageHeader
        description="Review form submissions captured by published pages."
        eyebrow="Leads"
        title="Submissions"
      />
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <ResourceToolbar>
        <label className="inline-field">
          Search
          <input
            aria-label="Search submissions"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage((current) => ({ ...current, offset: 0 }));
            }}
            placeholder="Name, email or phone"
            value={search}
          />
        </label>
        <label className="inline-field">
          Status
          <select
            aria-label="Filter submissions by status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage((current) => ({ ...current, offset: 0 }));
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </ResourceToolbar>
      <section className="panel">
        {items.length ? (
          <div aria-label="Submission list" className="list">
            {items.map((submission) => (
              <button
                className={
                  selected?.id === submission.id
                    ? 'list-row selectable selected submission-row'
                    : 'list-row selectable submission-row'
                }
                key={submission.id}
                onClick={() => setSelected(submission)}
                type="button"
              >
                <span>
                  <strong>
                    {submission.fields.find((field) => field.type === 'email')?.value ||
                      submission.fields[0]?.value ||
                      'Submission'}
                  </strong>
                  <span className="muted">
                    {submission.pageName} ·{' '}
                    {new Date(submission.submittedAt).toLocaleString()}
                  </span>
                </span>
                <StatusBadge status={submission.status} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Publish a page with a form to start collecting leads."
            title="No submissions yet"
          />
        )}
        <PaginationControls
          noun="submissions"
          onNext={() =>
            setPage((current) => ({ ...current, offset: current.offset + current.limit }))
          }
          onPrevious={() =>
            setPage((current) => ({
              ...current,
              offset: Math.max(0, current.offset - current.limit),
            }))
          }
          pagination={page}
        />
      </section>
      {selected ? (
        <Drawer
          description={`${selected.siteName} · ${selected.pageName}`}
          eyebrow="Submission detail"
          onClose={() => setSelected(null)}
          open
          title={selected.pageName}
        >
          <div className="detail-drawer-section">
            <span className="muted small">Status</span>
            <div className="detail-drawer-status-row">
              <StatusBadge status={selected.status} />
              <select
                aria-label="Submission status"
                onChange={(event) =>
                  void updateStatus(
                    selected,
                    event.target.value as FormSubmission['status'],
                  )
                }
                value={selected.status}
              >
                <option value="new">New</option>
                <option value="read">Read</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="detail-drawer-section">
            <strong>Submitted fields</strong>
            <div className="submission-detail-fields">
              {selected.fields.map((field) => (
                <div className="detail-field" key={field.fieldId}>
                  <span className="muted small">{field.label}</span>
                  <span>{String(field.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
