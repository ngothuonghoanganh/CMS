import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { SignupForm } from './SignupForm';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.mockReset();
  router.replace.mockReset();
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Họ và tên' }), 'Ngọc Anh');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ngocanh@mayxanh.vn');
  await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-dai');
  await user.type(screen.getByRole('textbox', { name: 'Tên workspace' }), 'Mây Xanh Agency');
}

describe('SignupForm', () => {
  it('shows every missing field before sending', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm next="/" />);

    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(screen.getByRole('textbox', { name: 'Họ và tên' })).toHaveAccessibleDescription(
      'Nhập họ và tên',
    );
    expect(screen.getByRole('textbox', { name: 'Tên workspace' })).toHaveAccessibleDescription(
      expect.stringContaining('Nhập tên workspace'),
    );
    expect(screen.getByLabelText('Mật khẩu')).toHaveAccessibleDescription(
      expect.stringContaining('Mật khẩu cần ít nhất 8 ký tự'),
    );
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('puts a server field error on its field', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(409, 'email_taken', 'Email này đã được đăng ký', [
        { path: ['email'], code: 'email_taken', message: 'Email này đã được đăng ký' },
      ]),
    );
    renderWithProviders(<SignupForm next="/" />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    await vi.waitFor(() => {
      expect(email).toHaveAccessibleDescription('Email này đã được đăng ký');
    });
    expect(email).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('creates the account and continues', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({
      user: { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' },
      memberships: [],
    });
    renderWithProviders(<SignupForm next="/" />);

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.signup, [], {
      body: {
        name: 'Ngọc Anh',
        email: 'ngocanh@mayxanh.vn',
        password: 'mat-khau-dai',
        workspaceName: 'Mây Xanh Agency',
      },
    });
  });
});
