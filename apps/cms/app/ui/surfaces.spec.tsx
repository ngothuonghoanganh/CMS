import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PaginationControls,
} from './surfaces';

describe('shared CMS data surfaces', () => {
  it('keeps table markup scrollable without changing table semantics', () => {
    const markup = renderToStaticMarkup(
      <DataTable className="audit-table">
        <caption>Audit events</caption>
        <tbody>
          <tr>
            <td>Created</td>
          </tr>
        </tbody>
      </DataTable>,
    );

    expect(markup).toContain('class="table-shell"');
    expect(markup).toContain('class="data-table audit-table"');
    expect(markup).toContain('<caption>Audit events</caption>');
  });

  it('exposes consistent empty, loading and error semantics', () => {
    const markup = renderToStaticMarkup(
      <>
        <EmptyState description="Create the first site." title="No sites yet" />
        <LoadingState label="Loading sites" />
        <ErrorState message="The site could not be loaded." title="Load failed" />
      </>,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('No sites yet');
    expect(markup).toContain('Loading sites');
    expect(markup).toContain('The site could not be loaded.');
  });

  it('renders an accessible server-pagination range and busy state', () => {
    const markup = renderToStaticMarkup(
      <PaginationControls
        busy
        noun="users"
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        pagination={{ hasNextPage: true, limit: 25, offset: 25, total: 60 }}
      />,
    );

    expect(markup).toContain('aria-label="users pagination"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('26–50 of 60 users');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
  });
});
