import { endpoints, type InvitationLookupResponse, type MeResponse } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { loadPage } from '../../lib/page-load';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { InvitationPage, PENDING_INVITATION_KEY } from './InvitationPage';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));
vi.mock(import('../../lib/page-load'), () => ({ loadPage: vi.fn() }));

const apiMock = vi.mocked(api);
const loadPageMock = vi.mocked(loadPage);
const WORKSPACE_ID = '64b0000000000000000000a1';

const invitation: InvitationLookupResponse = {
  state: 'pending',
  workspaceName: 'Mây Xanh Agency',
  invitedByName: 'Ngọc Anh',
  email: 'thuy.mkt@smilecare.vn',
  role: 'editor',
  siteNames: ['Nha khoa Smile Care'],
  expiresAt: '2026-11-06T03:00:00.000Z',
  accountExists: false,
};

function signedIn(email: string): MeResponse {
  return {
    user: { id: '64b0000000000000000000c9', name: 'Thùy', email },
    memberships: [],
  };
}

function serve(lookup: InvitationLookupResponse, me: MeResponse | null) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.lookupInvitation) {
      return Promise.resolve(lookup);
    }
    if (endpoint === endpoints.me) {
      return me === null
        ? Promise.reject(apiError(401, 'unauthenticated', 'Chưa đăng nhập'))
        : Promise.resolve(me);
    }
    if (endpoint === endpoints.signupInvited) {
      return Promise.resolve({
        ...signedIn(lookup.email),
        memberships: [
          {
            workspace: { id: WORKSPACE_ID, name: 'Mây Xanh Agency', slug: 'may-xanh-agency' },
            role: 'editor',
            siteIds: null,
          },
        ],
      });
    }
    if (endpoint === endpoints.acceptInvitation) {
      return Promise.resolve({ workspaceId: WORKSPACE_ID, slug: 'may-xanh-agency' });
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

beforeEach(() => {
  apiMock.mockReset();
  loadPageMock.mockReset();
  window.location.hash = '#token=bi-mat-cua-link';
  window.sessionStorage.clear();
});

afterEach(() => {
  window.location.hash = '';
  document.cookie = 'plp_ws=; Max-Age=0; Path=/';
});

describe('InvitationPage', () => {
  it('signs a new person up with the invited email and opens the workspace', async () => {
    const user = userEvent.setup();
    serve(invitation, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tạo tài khoản để tham gia' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ngọc Anh mời bạn vào/)).toBeInTheDocument();
    expect(screen.getByText(/trên site Nha khoa Smile Care/)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('thuy.mkt@smilecare.vn');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');

    await user.type(screen.getByLabelText('Họ và tên'), 'Thu Hà');
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-an-toan');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản và tham gia' }));
    expect(lastCallTo(apiMock, endpoints.signupInvited).options).toEqual({
      body: { token: 'bi-mat-cua-link', name: 'Thu Hà', password: 'mat-khau-an-toan' },
    });
    await vi.waitFor(() => {
      expect(loadPageMock).toHaveBeenCalledWith('/');
    });
    expect(document.cookie).toContain(`plp_ws=${WORKSPACE_ID}`);
  });

  it('lets the signed-in invited person join', async () => {
    const user = userEvent.setup();
    serve(invitation, signedIn('thuy.mkt@smilecare.vn'));
    renderWithProviders(<InvitationPage addresses={null} />);
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    expect(lastCallTo(apiMock, endpoints.acceptInvitation).options).toEqual({
      body: { token: 'bi-mat-cua-link' },
    });
    await vi.waitFor(() => {
      expect(loadPageMock).toHaveBeenCalledWith('/');
    });
  });

  it('opens the joined workspace at its own address when workspaces have one (ADR-025)', async () => {
    const user = userEvent.setup();
    document.cookie = 'plp_ws=; Max-Age=0; Path=/';
    serve(invitation, signedIn('thuy.mkt@smilecare.vn'));
    renderWithProviders(
      <InvitationPage
        addresses={{
          template: 'https://{slug}.app.example.vn',
          commonOrigin: 'https://app.example.vn',
        }}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    await vi.waitFor(() => {
      expect(loadPageMock).toHaveBeenCalledWith('https://may-xanh-agency.app.example.vn/');
    });
    expect(document.cookie).not.toContain(`plp_ws=${WORKSPACE_ID}`);
  });

  it('tells someone signed in with another email to sign out first', async () => {
    serve(invitation, signedIn('khoa@mayxanh.vn'));
    renderWithProviders(<InvitationPage addresses={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lời mời này dành cho email khácBạn đang đăng nhập bằng khoa@mayxanh.vn.',
    );
    expect(
      screen.getByRole('button', { name: 'Đăng xuất và dùng email được mời' }),
    ).toBeInTheDocument();
  });

  it('keeps the link while an existing account signs in', async () => {
    const user = userEvent.setup();
    serve({ ...invitation, accountExists: true }, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    await user.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(window.sessionStorage.getItem(PENDING_INVITATION_KEY)).toBe('bi-mat-cua-link');
    expect(loadPageMock).toHaveBeenCalledWith('/login?next=%2Finvite');
  });

  it('says when the invitation expired or was used', async () => {
    serve({ ...invitation, state: 'expired' }, null);
    const { unmount } = renderWithProviders(<InvitationPage addresses={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời đã hết hạn' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hãy nhờ Ngọc Anh gửi lại/)).toBeInTheDocument();
    unmount();

    serve({ ...invitation, state: 'accepted' }, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời đã được dùng' }),
    ).toBeInTheDocument();
  });
});
