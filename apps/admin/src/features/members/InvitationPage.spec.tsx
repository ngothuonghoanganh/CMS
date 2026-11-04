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
  inviterEmail: null,
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
    if (endpoint === endpoints.declineInvitation) {
      return Promise.resolve(undefined);
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
    // A password manager saves the new password under the email, not the name typed next.
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Email')).toHaveAttribute('name', 'email');

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

  it('says the invitation was declined, though the link kept while signing in is gone', async () => {
    const user = userEvent.setup();
    // Back from signing in: the link's secret was kept in the session, not in the address.
    window.location.hash = '';
    window.sessionStorage.setItem(PENDING_INVITATION_KEY, 'bi-mat-cua-link');
    serve(invitation, signedIn('thuy.mkt@smilecare.vn'));
    renderWithProviders(<InvitationPage addresses={null} />);

    await user.click(await screen.findByRole('button', { name: 'Từ chối lời mời' }));
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: 'Bạn đã từ chối lời mời',
    });
    expect(heading).toHaveFocus();
    expect(
      screen.getByText(
        'Bạn không tham gia Mây Xanh Agency. Nếu đổi ý, hãy nhờ Ngọc Anh gửi lời mời mới.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Liên kết mời không hợp lệ')).toBeNull();
    expect(lastCallTo(apiMock, endpoints.declineInvitation).options).toEqual({
      body: { token: 'bi-mat-cua-link' },
    });
    expect(window.sessionStorage.getItem(PENDING_INVITATION_KEY)).toBeNull();
    // The page is not a dead end: the start page opens the user's workspaces.
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });

  it('shows another link opened in the same tab, not the answer given to the one before', async () => {
    const user = userEvent.setup();
    const signedInUser = signedIn('thuy.mkt@smilecare.vn');
    serve(invitation, signedInUser);
    renderWithProviders(<InvitationPage addresses={null} />);
    await user.click(await screen.findByRole('button', { name: 'Từ chối lời mời' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bạn đã từ chối lời mời' }),
    ).toBeInTheDocument();

    // The email of another invitation opens in this tab: only the fragment changes.
    serve({ ...invitation, workspaceName: 'Phòng khám Gia Đình' }, signedInUser);
    window.location.hash = '#token=link-moi';

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tham gia Phòng khám Gia Đình?' }),
    ).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.lookupInvitation).options).toEqual({
      body: { token: 'link-moi' },
    });
  });

  it('keeps a failed answer to its own link', async () => {
    const user = userEvent.setup();
    const signedInUser = signedIn('thuy.mkt@smilecare.vn');
    serve(invitation, signedInUser);
    const served = apiMock.getMockImplementation();
    apiMock.mockImplementation((endpoint, ...rest) =>
      endpoint === endpoints.declineInvitation
        ? Promise.reject(apiError(503, 'internal', 'Máy chủ đang bận'))
        : (served?.(endpoint, ...rest) ?? Promise.reject(new Error('unexpected call'))),
    );
    renderWithProviders(<InvitationPage addresses={null} />);
    await user.click(await screen.findByRole('button', { name: 'Từ chối lời mời' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang bận');

    const other = { ...invitation, workspaceName: 'Phòng khám Gia Đình' };
    apiMock.mockImplementation((endpoint, ...rest) =>
      endpoint === endpoints.lookupInvitation
        ? Promise.resolve(other)
        : (served?.(endpoint, ...rest) ?? Promise.reject(new Error('unexpected call'))),
    );
    window.location.hash = '#token=link-moi';

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tham gia Phòng khám Gia Đình?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens the workspace after "Tham gia" without calling the link invalid meanwhile', async () => {
    const user = userEvent.setup();
    window.location.hash = '';
    window.sessionStorage.setItem(PENDING_INVITATION_KEY, 'bi-mat-cua-link');
    serve(invitation, signedIn('thuy.mkt@smilecare.vn'));
    renderWithProviders(<InvitationPage addresses={null} />);

    await user.click(await screen.findByRole('button', { name: 'Tham gia' }));
    await vi.waitFor(() => {
      expect(loadPageMock).toHaveBeenCalledWith('/');
    });
    // The page loads the workspace; until then it says so.
    expect(screen.getByText('Đang mở Mây Xanh Agency')).toBeInTheDocument();
    expect(screen.queryByText('Liên kết mời không hợp lệ')).toBeNull();
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

  it('lets someone with an account sign in to join from the sign-up form too', async () => {
    const user = userEvent.setup();
    serve(invitation, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    expect(await screen.findByRole('textbox', { name: 'Email' })).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(window.sessionStorage.getItem(PENDING_INVITATION_KEY)).toBe('bi-mat-cua-link');
    expect(loadPageMock).toHaveBeenCalledWith('/login?next=%2Finvite');
  });

  it('says when the invitation expired or was used', async () => {
    serve({ ...invitation, state: 'expired', inviterEmail: 'ngocanh@mayxanh.vn' }, null);
    const { unmount } = renderWithProviders(<InvitationPage addresses={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời đã hết hạn' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hãy nhờ Ngọc Anh gửi lại/)).toBeInTheDocument();
    // The inviter is asked by email for another link (ADR-021), in an email already written.
    const ask = new URL(
      screen.getByRole('link', { name: 'Nhờ Ngọc Anh gửi lại' }).getAttribute('href') ?? '',
    );
    expect(ask.protocol).toBe('mailto:');
    expect(ask.pathname).toBe('ngocanh@mayxanh.vn');
    expect(ask.search).not.toContain('+');
    expect(ask.searchParams.get('subject')).toBe('Nhờ gửi lại lời mời vào Mây Xanh Agency');
    expect(ask.searchParams.get('body')).toBe(
      'Chào Ngọc Anh,\n\nLời mời vào Mây Xanh Agency gửi tới thuy.mkt@smilecare.vn đã hết hạn. ' +
        'Nhờ bạn gửi lại giúp mình.\n\nCảm ơn bạn!',
    );
    // Without a mail app, the address is there to copy.
    expect(screen.getByText('ngocanh@mayxanh.vn')).toBeInTheDocument();
    expect(screen.getByText(/^Email của Ngọc Anh:/)).toHaveTextContent(
      'Email của Ngọc Anh: ngocanh@mayxanh.vn',
    );
    unmount();

    serve({ ...invitation, state: 'accepted' }, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời đã được dùng' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /gửi lại/ })).not.toBeInTheDocument();
  });

  it('asks nobody by email when the inviter’s address is not given', async () => {
    serve({ ...invitation, state: 'expired', inviterEmail: null }, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời đã hết hạn' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /gửi lại/ })).not.toBeInTheDocument();
  });

  it('shows the workspace’s initials and what to do with an unknown invitation', async () => {
    serve(invitation, null);
    renderWithProviders(<InvitationPage addresses={null} />);
    await screen.findByRole('heading', { level: 1, name: 'Tạo tài khoản để tham gia' });
    expect(screen.getByText('MX')).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByText(
        'Không biết người mời? Bạn có thể bỏ qua email này. Lời mời tự hết hạn sau 7 ngày.',
      ),
    ).toBeInTheDocument();
  });
});
