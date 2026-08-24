'use client';

import {
  BillingSummarySchema,
  type BillingSummary,
  type BillingUsageItem,
} from '@payload/contracts';
import { useEffect, useState } from 'react';

import { api } from './lib/api';

const labels: Record<BillingUsageItem['metric'], string> = {
  workspaces: 'Workspaces',
  landing_pages: 'Landing pages',
  custom_domains: 'Custom domains',
  integrations: 'Integrations',
  page_views_monthly: 'Monthly page views',
  form_submissions_monthly: 'Monthly form submissions',
};

export function BillingView({ workspaceId }: { workspaceId: string }) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .get('/billing')
      .then((response) => {
        if (active) setSummary(BillingSummarySchema.parse(response));
      })
      .catch((caughtError: unknown) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Billing data unavailable',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  if (loading) {
    return (
      <main className="loading-page" aria-busy="true">
        Loading billing…
      </main>
    );
  }
  if (error) {
    return (
      <section className="panel" role="alert">
        <strong>Billing data unavailable</strong>
        <p className="muted">{error}</p>
      </section>
    );
  }
  if (!summary) return null;

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Tenant billing</span>
        <h1>Billing &amp; usage</h1>
        <p className="muted">
          Resource limits are enforced before creation. Usage-based limits are currently
          soft and do not take published sites offline.
        </p>
      </div>
      <section className="panel billing-plan-card">
        <div>
          <span className="muted small">Current plan</span>
          <h2>{summary.plan.name}</h2>
          <span className="pill">{summary.subscription.status}</span>
        </div>
        <div className="muted small">
          Period: {formatDate(summary.subscription.currentPeriodStart)} –{' '}
          {formatDate(summary.subscription.currentPeriodEnd)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Entitlements and usage</h2>
          <span className="muted small">
            {formatDate(summary.usage.periodStart)} –{' '}
            {formatDate(summary.usage.periodEnd)}
          </span>
        </div>
        <div className="usage-grid">
          {summary.usage.items.map((item) => (
            <UsageCard item={item} key={item.metric} />
          ))}
        </div>
      </section>
    </>
  );
}

function UsageCard({ item }: { item: BillingUsageItem }) {
  const percentage =
    item.limit === null ? 0 : Math.min(100, (item.value / item.limit) * 100);
  const isNearLimit = item.limit !== null && percentage >= 80;
  return (
    <article className={isNearLimit ? 'usage-card near-limit' : 'usage-card'}>
      <div className="panel-heading">
        <strong>{labels[item.metric]}</strong>
        <span className="pill">{item.enforcement}</span>
      </div>
      <div className="usage-value">
        {item.value.toLocaleString()}{' '}
        <span className="muted">/ {formatLimit(item.limit)}</span>
      </div>
      {item.limit !== null ? (
        <div aria-hidden="true" className="usage-bar">
          <span style={{ width: `${percentage}%` }} />
        </div>
      ) : null}
      {isNearLimit ? (
        <span className="muted small">Approaching this plan limit.</span>
      ) : null}
    </article>
  );
}

function formatLimit(limit: number | null): string {
  return limit === null ? 'Unlimited' : limit.toLocaleString();
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}
