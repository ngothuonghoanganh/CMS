import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { ForgotPasswordForm } from './ForgotPasswordForm';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.mockReset();
});

describe('ForgotPasswordForm (ADR-026)', () => {
  it('asks for a link and says the same whether the email has an account or not', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ email: 'ngocanh@mayxanh.vn' });
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'NgocAnh@MayXanh.vn ');
    await user.click(screen.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }));

    expect(lastCallTo(apiMock, endpoints.forgotPassword).options).toEqual({
      body: { email: 'ngocanh@mayxanh.vn' },
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(
      'Nếu email này có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu',
    );
    expect(status.parentElement).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Quay lại đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('checks the email before sending', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'khong-phai-email');
    await user.click(screen.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email).toHaveAccessibleDescription('Email không hợp lệ');
    expect(email).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('says why no email could go, e.g. too many in the hour', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(429, 'rate_limited', 'Đã gửi quá nhiều email tới địa chỉ này'),
    );
    renderWithProviders(<ForgotPasswordForm />);

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ngocanh@mayxanh.vn');
    await user.click(screen.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã gửi quá nhiều email tới địa chỉ này',
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('ngocanh@mayxanh.vn');
  });
});
