import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AccessRequestDialog } from './AccessRequestDialog';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';

const pending = {
  id: '64b0000000000000000000e1',
  user: { id: '64b0000000000000000000c4', name: 'Đức Trí', email: 'tri@smilecare.vn' },
  current: { role: 'viewer' as const, siteIds: null },
  role: 'editor' as const,
  wholeWorkspace: true,
  note: '',
  createdAt: '2026-10-31T03:00:00.000Z',
};

beforeEach(() => {
  apiMock.mockReset();
});

describe('AccessRequestDialog', () => {
  it('asks Chủ sở hữu for another role, with a note', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      Promise.resolve(
        endpoint === endpoints.myAccessRequest ? { request: null } : { request: pending },
      ),
    );
    renderWithProviders(
      <AccessRequestDialog
        workspaceId={WORKSPACE_ID}
        role="viewer"
        siteLimited={false}
        open
        onOpenChange={vi.fn()}
      />,
    );
    // The role the member has is not offered.
    expect(await screen.findByRole('radio', { name: /Biên tập/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Chỉ xem/ })).toBeNull();
    await user.click(screen.getByRole('radio', { name: /Biên tập/ }));
    await user.click(screen.getByRole('checkbox', { name: /Trên toàn workspace/ }));
    await user.type(screen.getByLabelText('Lời nhắn cho Chủ sở hữu'), 'Cần sửa trang');
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(lastCallTo(apiMock, endpoints.createAccessRequest)).toEqual({
      args: [WORKSPACE_ID],
      options: { body: { role: 'editor', wholeWorkspace: true, note: 'Cần sửa trang' } },
    });
  });

  it('lets a member kept to some sites ask for their role on the whole workspace', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      Promise.resolve(
        endpoint === endpoints.myAccessRequest ? { request: null } : { request: pending },
      ),
    );
    renderWithProviders(
      <AccessRequestDialog
        workspaceId={WORKSPACE_ID}
        role="editor"
        siteLimited
        open
        onOpenChange={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole('radio', { name: /Biên tập/ }));
    expect(screen.queryByRole('checkbox', { name: /Trên toàn workspace/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(lastCallTo(apiMock, endpoints.createAccessRequest).options).toEqual({
      body: { role: 'editor', wholeWorkspace: true, note: '' },
    });
  });

  it('shows the request still waiting instead of a new one', async () => {
    apiMock.mockResolvedValue({ request: pending });
    renderWithProviders(
      <AccessRequestDialog
        workspaceId={WORKSPACE_ID}
        role="viewer"
        siteLimited={false}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(await screen.findByText('Bạn đang có một yêu cầu chờ duyệt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu' })).toBeNull();
  });
});
