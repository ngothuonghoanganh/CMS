import { endpoints, type Membership } from '@plp/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKSPACE_ID } from '../../../../../../features/dashboard/test-fixtures';
import { marketplaceDetailFixture } from '../../../../../../features/marketplace/test-fixtures';
import { apiError, renderWithProviders } from '../../../../../../features/shell/test-utils';
import { serverApi } from '../../../../../../lib/server-api';
import MarketplaceItemPage from './page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

const membership: Membership = {
  workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency', slug: 'may-xanh-agency' },
  role: 'owner',
  siteIds: null,
};
vi.mock('../../../../../../features/shell/workspace-context', () => ({
  loadWorkspaceContext: () => Promise.resolve({ membership }),
}));
vi.mock(import('../../../../../../lib/server-api'), () => ({ serverApi: vi.fn() }));

const serverApiMock = vi.mocked(serverApi);

function open(itemId: string) {
  return MarketplaceItemPage({
    params: Promise.resolve({ workspaceId: WORKSPACE_ID, itemId }),
  });
}

beforeEach(() => {
  serverApiMock.mockReset();
});

describe('marketplace item page (board 31)', () => {
  it('reads the item of the workspace and shows it', async () => {
    serverApiMock.mockResolvedValue(marketplaceDetailFixture());
    renderWithProviders(await open('mp-khai-truong-phong-tap'));
    expect(serverApiMock).toHaveBeenCalledWith(endpoints.getMarketplaceItem, [
      WORKSPACE_ID,
      'mp-khai-truong-phong-tap',
    ]);
    expect(screen.getByRole('heading', { level: 1, name: 'Khai trương phòng tập' })).toBeVisible();
  });

  it('renders the 404 page for an item that is unknown, a draft or withdrawn', async () => {
    serverApiMock.mockRejectedValue(apiError(404, 'not_found', 'Không tìm thấy mẫu'));
    await expect(open('mp-mau-dang-soan')).rejects.toThrow('not found');
  });

  it('does not hide a server failure as a 404', async () => {
    serverApiMock.mockRejectedValue(new Error('API down'));
    await expect(open('mp-khai-truong-phong-tap')).rejects.toThrow('API down');
  });
});
