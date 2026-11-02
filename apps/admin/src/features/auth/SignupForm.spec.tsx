import { endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { SignupForm } from './SignupForm';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const EMAIL = 'ngocanh@mayxanh.vn';

beforeEach(() => {
  apiMock.mockReset();
});

function renderForm() {
  return renderWithProviders(<SignupForm footer="Đã có tài khoản?" />);
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: 'Họ và tên' }), 'Ngọc Anh');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), EMAIL);
  await user.type(screen.getByLabelText('Mật khẩu'), 'mat-khau-dai');
  await user.type(screen.getByRole('textbox', { name: 'Tên workspace' }), 'Mây Xanh Agency');
}

/** Fills the form and sends it; the API answers that the link went out. */
async function signUp(user: ReturnType<typeof userEvent.setup>) {
  apiMock.mockResolvedValueOnce({ email: EMAIL });
  await fillForm(user);
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
  await screen.findByRole('heading', { level: 1, name: 'Kiểm tra email' });
}

describe('SignupForm', () => {
  it('posts, so a submit before the page is interactive keeps the password out of the URL', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Tạo tài khoản' }).closest('form')).toHaveAttribute(
      'method',
      'post',
    );
  });

  it('shows every missing field before sending', async () => {
    const user = userEvent.setup();
    renderForm();

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
      apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
        { path: ['email'], code: 'invalid_format', message: 'Email không hợp lệ' },
      ]),
    );
    renderForm();

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    await vi.waitFor(() => {
      expect(email).toHaveAccessibleDescription('Email không hợp lệ');
    });
    expect(email).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('emails a confirmation link and says where it went (ADR-026)', async () => {
    const user = userEvent.setup();
    renderForm();

    await signUp(user);

    expect(lastCallTo(apiMock, endpoints.signup).options).toEqual({
      body: {
        name: 'Ngọc Anh',
        email: EMAIL,
        password: 'mat-khau-dai',
        workspaceName: 'Mây Xanh Agency',
      },
    });
    const message = screen.getByText(/Chúng tôi đã gửi link xác nhận tới/);
    expect(message).toHaveTextContent(EMAIL);
    // The form that had focus is gone: the message takes it, so it is read out.
    expect(message.parentElement).toHaveFocus();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Đã có tài khoản?')).toBeInTheDocument();
  });

  it('sends the email again', async () => {
    const user = userEvent.setup();
    renderForm();
    await signUp(user);

    apiMock.mockResolvedValueOnce({ email: EMAIL });
    await user.click(screen.getByRole('button', { name: 'Gửi lại' }));

    expect(lastCallTo(apiMock, endpoints.resendSignup).options).toEqual({
      body: { email: EMAIL },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(`Đã gửi lại email tới ${EMAIL}.`);
  });

  it('says why the email could not go again', async () => {
    const user = userEvent.setup();
    renderForm();
    await signUp(user);

    apiMock.mockRejectedValueOnce(
      apiError(503, 'email_unavailable', 'Chưa gửi được email, thử lại sau ít phút'),
    );
    await user.click(screen.getByRole('button', { name: 'Gửi lại' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chưa gửi được email, thử lại sau ít phút',
    );
  });

  it('goes back to the form, as it was, to change the email', async () => {
    const user = userEvent.setup();
    renderForm();
    await signUp(user);

    await user.click(screen.getByRole('button', { name: 'Đổi email' }));

    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email).toHaveValue(EMAIL);
    expect(email).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Tên workspace' })).toHaveValue('Mây Xanh Agency');
    expect(screen.getByRole('heading', { level: 1, name: 'Tạo tài khoản' })).toBeInTheDocument();
  });
});
