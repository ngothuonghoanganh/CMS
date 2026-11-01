import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { ResetPasswordForm } from './ResetPasswordForm';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const TOKEN = 'r'.repeat(43);

beforeEach(() => {
  apiMock.mockReset();
  router.replace.mockReset();
  window.history.replaceState(null, '', `/reset-password#token=${TOKEN}`);
});

async function typePasswords(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  again: string,
) {
  await user.type(screen.getByLabelText('Mật khẩu mới'), password);
  await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), again);
  await user.click(screen.getByRole('button', { name: 'Đặt mật khẩu mới' }));
}

describe('ResetPasswordForm (ADR-026)', () => {
  it('sets the new password with the link’s secret, then opens the admin', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({
      user: { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' },
      memberships: [],
    });
    renderWithProviders(<ResetPasswordForm />);

    await typePasswords(user, 'mat-khau-moi-123', 'mat-khau-moi-123');

    expect(lastCallTo(apiMock, endpoints.resetPassword).options).toEqual({
      body: { token: TOKEN, password: 'mat-khau-moi-123' },
    });
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('asks again when the two passwords differ, and sends nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm />);

    await typePasswords(user, 'mat-khau-moi-123', 'mat-khau-khac-123');

    const again = screen.getByLabelText('Nhập lại mật khẩu mới');
    expect(again).toHaveAccessibleDescription('Hai mật khẩu chưa khớp');
    expect(again).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('takes the sign-up rules for the new password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordForm />);

    await typePasswords(user, 'ngan', 'ngan');

    expect(screen.getByLabelText('Mật khẩu mới')).toHaveAccessibleDescription(
      expect.stringContaining('Mật khẩu cần ít nhất 8 ký tự'),
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('offers a new link when this one was used or expired', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(410, 'reset_link_invalid', 'Link đặt lại mật khẩu không còn dùng được'),
    );
    renderWithProviders(<ResetPasswordForm />);

    await typePasswords(user, 'mat-khau-moi-123', 'mat-khau-moi-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Link đặt lại mật khẩu không còn dùng được',
    );
    expect(screen.getByRole('link', { name: 'Gửi link mới' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('explains a link without its secret', () => {
    window.history.replaceState(null, '', '/reset-password');
    renderWithProviders(<ResetPasswordForm />);
    expect(screen.getByText('Liên kết không đầy đủ')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mật khẩu mới')).toBeNull();
  });
});
