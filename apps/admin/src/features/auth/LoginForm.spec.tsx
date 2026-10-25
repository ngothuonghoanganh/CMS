import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { LoginForm } from './LoginForm';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const me = {
  user: { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' },
  memberships: [],
};

beforeEach(() => {
  apiMock.mockReset();
  router.replace.mockReset();
});

describe('LoginForm', () => {
  it('shows the contract messages on submit, moves focus to the first problem and sends nothing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm next="/" />);

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email).toHaveAccessibleDescription('Email không hợp lệ');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveFocus();
    expect(screen.getByLabelText('Mật khẩu')).toHaveAccessibleDescription('Nhập mật khẩu');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('checks a field on blur and clears the error once it is fixed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm next="/" />);
    const email = screen.getByRole('textbox', { name: 'Email' });

    await user.type(email, 'ngocanh@');
    await user.tab();
    expect(email).toHaveAccessibleDescription('Email không hợp lệ');

    await user.type(email, 'mayxanh.vn');
    expect(email).not.toHaveAttribute('aria-invalid');
  });

  it('shows the server message for invalid credentials', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng'),
    );
    renderWithProviders(<LoginForm next="/" />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'NgocAnh@MayXanh.vn ');
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng');
    expect(apiMock).toHaveBeenCalledWith(endpoints.login, [], {
      body: { email: 'ngocanh@mayxanh.vn', password: 'sai-mat-khau' },
    });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the next path after signing in', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(me);
    renderWithProviders(<LoginForm next="/sites/64b000000000000000000001" />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ngocanh@mayxanh.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-dung');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/sites/64b000000000000000000001');
    });
  });
});
