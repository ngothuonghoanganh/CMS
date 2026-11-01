import { endpoints } from '@plp/contracts';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { VerifySignup } from './VerifySignup';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const TOKEN = 'a'.repeat(43);

function openLink(fragment: string) {
  window.history.replaceState(null, '', `/signup/verify${fragment}`);
}

beforeEach(() => {
  apiMock.mockReset();
  router.replace.mockReset();
  openLink(`#token=${TOKEN}`);
});

describe('VerifySignup (ADR-026)', () => {
  it('confirms only on a click, then opens the new workspace from the start page', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({
      user: { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' },
      memberships: [],
    });
    const { queryClient } = renderWithProviders(<VerifySignup />);
    queryClient.setQueryData(['stale'], 'from another session');
    // Opening the link, as a mail scanner may, confirms nothing.
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' }));

    expect(lastCallTo(apiMock, endpoints.verifySignup).options).toEqual({
      body: { token: TOKEN },
    });
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
    expect(queryClient.getQueryData(['stale'])).toBeUndefined();
  });

  it('offers to sign up again when the link was used or expired', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(410, 'signup_link_invalid', 'Link xác nhận không còn dùng được'),
    );
    renderWithProviders(<VerifySignup />);

    await user.click(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Link xác nhận không còn dùng được');
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('button', { name: 'Xác nhận và tạo workspace' })).toBeNull();
  });

  it('sends an email that got an account meanwhile to the login page', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(apiError(409, 'email_taken', 'Email này đã có tài khoản'));
    renderWithProviders(<VerifySignup />);

    await user.click(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email này đã có tài khoản');
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('keeps the button for another try after a failure on our side', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderWithProviders(<VerifySignup />);

    await user.click(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    expect(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' })).toBeEnabled();
  });

  it('asks again for another link opened in the same tab', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(410, 'signup_link_invalid', 'Link xác nhận không còn dùng được'),
    );
    renderWithProviders(<VerifySignup />);
    await user.click(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Only the fragment changes, so the page is not loaded again.
    const other = 'b'.repeat(43);
    act(() => {
      openLink(`#token=${other}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    apiMock.mockResolvedValueOnce({
      user: { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' },
      memberships: [],
    });
    await user.click(screen.getByRole('button', { name: 'Xác nhận và tạo workspace' }));
    expect(lastCallTo(apiMock, endpoints.verifySignup).options).toEqual({ body: { token: other } });
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('explains a link without its secret', () => {
    openLink('');
    renderWithProviders(<VerifySignup />);
    expect(screen.getByText('Liên kết không đầy đủ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
