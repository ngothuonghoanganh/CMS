import { endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AccountScreen } from './AccountScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const user = { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: 'ngocanh@mayxanh.vn' };

beforeEach(() => {
  apiMock.mockReset();
  router.refresh.mockReset();
});

function passwordSection() {
  return within(screen.getByRole('region', { name: 'Đổi mật khẩu' }));
}

async function changePassword(
  events: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
  again = next,
) {
  const section = passwordSection();
  await events.type(section.getByLabelText('Mật khẩu hiện tại'), current);
  await events.type(section.getByLabelText('Mật khẩu mới'), next);
  await events.type(section.getByLabelText('Nhập lại mật khẩu mới'), again);
  await events.click(section.getByRole('button', { name: 'Đổi mật khẩu' }));
}

describe('AccountScreen (ADR-026)', () => {
  it('shows the email read only and saves the display name', async () => {
    const events = userEvent.setup();
    apiMock.mockResolvedValueOnce({ user: { ...user, name: 'Ngọc Anh Trần' }, memberships: [] });
    renderWithProviders(<AccountScreen user={user} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tài khoản' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(user.email);
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('readonly');
    const name = screen.getByRole('textbox', { name: 'Tên hiển thị' });
    await events.clear(name);
    await events.type(name, 'Ngọc Anh Trần');
    await events.click(screen.getByRole('button', { name: 'Lưu tên hiển thị' }));

    expect(lastCallTo(apiMock, endpoints.updateMe).options).toEqual({
      body: { name: 'Ngọc Anh Trần' },
    });
    expect(await screen.findByText('Đã lưu tên hiển thị')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('refuses an empty display name before sending', async () => {
    const events = userEvent.setup();
    renderWithProviders(<AccountScreen user={user} />);

    const name = screen.getByRole('textbox', { name: 'Tên hiển thị' });
    await events.clear(name);
    await events.click(screen.getByRole('button', { name: 'Lưu tên hiển thị' }));

    expect(name).toHaveAccessibleDescription(expect.stringContaining('Nhập họ và tên'));
    expect(name).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('changes the password and clears the fields', async () => {
    const events = userEvent.setup();
    apiMock.mockResolvedValueOnce(undefined);
    renderWithProviders(<AccountScreen user={user} />);

    await changePassword(events, 'mat-khau-cu-123', 'mat-khau-moi-123');

    expect(lastCallTo(apiMock, endpoints.changePassword).options).toEqual({
      body: { currentPassword: 'mat-khau-cu-123', newPassword: 'mat-khau-moi-123' },
    });
    expect(await screen.findByText('Các thiết bị khác đã được đăng xuất.')).toBeInTheDocument();
    expect(passwordSection().getByLabelText('Mật khẩu hiện tại')).toHaveValue('');
    expect(passwordSection().getByLabelText('Mật khẩu mới')).toHaveValue('');
  });

  it('puts a wrong current password on its field', async () => {
    const events = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(422, 'invalid_credentials', 'Mật khẩu hiện tại không đúng', [
        {
          path: ['currentPassword'],
          code: 'invalid_credentials',
          message: 'Mật khẩu hiện tại không đúng',
        },
      ]),
    );
    renderWithProviders(<AccountScreen user={user} />);

    await changePassword(events, 'doan-sai-123', 'mat-khau-moi-123');

    const current = passwordSection().getByLabelText('Mật khẩu hiện tại');
    await vi.waitFor(() => {
      expect(current).toHaveAccessibleDescription('Mật khẩu hiện tại không đúng');
    });
    expect(current).toHaveFocus();
  });

  it('says when the account is held back by too many wrong passwords', async () => {
    const events = userEvent.setup();
    apiMock.mockRejectedValueOnce(apiError(429, 'rate_limited', 'Nhập sai mật khẩu quá nhiều lần'));
    renderWithProviders(<AccountScreen user={user} />);

    await changePassword(events, 'mat-khau-cu-123', 'mat-khau-moi-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập sai mật khẩu quá nhiều lần');
  });

  it('says to log in again when the password was changed elsewhere meanwhile', async () => {
    const events = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(409, 'password_changed', 'Mật khẩu vừa được đổi ở nơi khác. Đăng nhập lại.'),
    );
    renderWithProviders(<AccountScreen user={user} />);

    await changePassword(events, 'mat-khau-cu-123', 'mat-khau-moi-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Mật khẩu vừa được đổi ở nơi khác. Đăng nhập lại.',
    );
  });

  it('asks again when the new passwords differ, and sends nothing', async () => {
    const events = userEvent.setup();
    renderWithProviders(<AccountScreen user={user} />);

    await changePassword(events, 'mat-khau-cu-123', 'mat-khau-moi-123', 'mat-khau-khac-123');

    const again = passwordSection().getByLabelText('Nhập lại mật khẩu mới');
    expect(again).toHaveAccessibleDescription('Hai mật khẩu chưa khớp');
    expect(again).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('leads back to the admin', () => {
    renderWithProviders(<AccountScreen user={user} />);
    expect(screen.getByRole('link', { name: 'Quay lại trang quản trị' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
