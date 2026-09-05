'use client';

import { AuditLogListResponseSchema, type AuditLog } from '@payload/contracts';
import { useEffect, useState } from 'react';

import { useCmsShell } from '../cms-shell';
import { ApiClientError, api } from '../lib/api';
import { AuditView } from './audit-view';

export default function AuditPage() {
  const { workspaceId } = useCmsShell();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasNextPage: false,
  });
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function load(offset = 0, action = actionFilter, resourceType = resourceFilter) {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (action) params.set('action', action);
      if (resourceType) params.set('resourceType', resourceType);
      const response = AuditLogListResponseSchema.parse(
        await api.get(`/audit-logs?${params.toString()}`),
      );
      setLogs(response.items);
      setPagination(response.pagination);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : 'Unable to load audit events.',
      );
    }
  }
  useEffect(() => {
    void load();
  }, [workspaceId]);
  return (
    <>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <AuditView
        actionFilter={actionFilter}
        auditLogs={logs}
        onFilter={(filters) => {
          setActionFilter(filters.action);
          setResourceFilter(filters.resourceType);
          void load(0, filters.action, filters.resourceType);
        }}
        onNext={() => void load(pagination.offset + pagination.limit)}
        onPrevious={() => void load(Math.max(0, pagination.offset - pagination.limit))}
        pagination={pagination}
        resourceFilter={resourceFilter}
      />
    </>
  );
}
