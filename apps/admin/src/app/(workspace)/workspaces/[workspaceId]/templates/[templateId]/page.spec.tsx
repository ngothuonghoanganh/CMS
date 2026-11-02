import { endpoints, type Membership, type TemplateDetail } from '@plp/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_ID,
  siteFixture,
  WORKSPACE_ID,
} from '../../../../../../features/dashboard/test-fixtures';
import { renderWithProviders } from '../../../../../../features/shell/test-utils';
import {
  detailFixture,
  WORKSPACE_TEMPLATE_ID,
} from '../../../../../../features/templates/test-fixtures';
import { serverApi } from '../../../../../../lib/server-api';
import TemplatePage from './page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const membership: Membership = {
  workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency', slug: 'may-xanh-agency' },
  role: 'owner',
  siteIds: null,
};
const smile = siteFixture({ name: 'Smile Care' });
vi.mock('../../../../../../features/shell/workspace-context', () => ({
  loadWorkspaceContext: () => Promise.resolve({ membership, sites: [smile], site: smile }),
}));
vi.mock(import('../../../../../../lib/server-api'), () => ({ serverApi: vi.fn() }));

const serverApiMock = vi.mocked(serverApi);

/** The workspace template at v3, or at the version asked for. */
function template(version?: number): TemplateDetail {
  return detailFixture('nha-khoa-uu-dai', {
    id: WORKSPACE_TEMPLATE_ID,
    source: 'workspace',
    version: version ?? 3,
    currentVersion: 3,
  });
}

function open(search: Record<string, string>) {
  return TemplatePage({
    params: Promise.resolve({ workspaceId: WORKSPACE_ID, templateId: WORKSPACE_TEMPLATE_ID }),
    searchParams: Promise.resolve(search),
  });
}

beforeEach(() => {
  serverApiMock.mockReset();
  serverApiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint !== endpoints.getTemplate) {
      return Promise.reject(new Error('unexpected call'));
    }
    const query = (options as { query: { version?: number } }).query;
    return Promise.resolve(template(query.version));
  });
});

describe('template page (board 18)', () => {
  it('shows the version "Xem trước vN" of the history asks for, with nothing made from it', async () => {
    renderWithProviders(await open({ site: SITE_ID, version: '1' }));
    expect(serverApiMock).toHaveBeenCalledWith(
      endpoints.getTemplate,
      [WORKSPACE_ID, WORKSPACE_TEMPLATE_ID],
      { query: { siteId: SITE_ID, version: 1 } },
    );
    expect(screen.getByText(/Bạn đang xem v1\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem v3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạo trang từ mẫu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Áp dụng vào trang đang sửa…' })).toBeNull();
  });

  it('shows the current version without one, or with one that is not a version number', async () => {
    for (const search of [{ site: SITE_ID }, { site: SITE_ID, version: 'abc' }]) {
      const { unmount } = renderWithProviders(await open(search));
      expect(serverApiMock).toHaveBeenLastCalledWith(
        endpoints.getTemplate,
        [WORKSPACE_ID, WORKSPACE_TEMPLATE_ID],
        { query: { siteId: SITE_ID } },
      );
      expect(screen.getByRole('button', { name: 'Tạo trang từ mẫu' })).toBeInTheDocument();
      unmount();
    }
  });
});
