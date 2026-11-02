import { endpoints, type SignupLookupResponse } from '@plp/contracts';
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
const PASSWORD = 'mat-khau-an-toan-123';
const SIGNUP: SignupLookupResponse = {
  email: 'ngocanh@mayxanh.vn',
  name: 'Ngọc Anh',
  workspaceName: 'Mây Xanh Agency',
};
const ME = {
  user: { id: '64b0000000000000000000c1', name: 'Ngọc Anh', email: SIGNUP.email },
  memberships: [],
};

type Answer = { value: unknown } | { error: Error };

/**
 * The API as the page meets it: each endpoint answers from its own queue, in order, and the last
 * answer of a queue stays.
 */
function answer(answers: { lookup?: Answer[]; verify?: Answer[] }) {
  const queues = new Map<unknown, Answer[]>([
    [endpoints.lookupSignup, answers.lookup ?? [{ value: SIGNUP }]],
    [endpoints.verifySignup, answers.verify ?? [{ value: ME }]],
  ]);
  apiMock.mockImplementation((endpoint: unknown) => {
    const queue = queues.get(endpoint);
    const next = (queue && queue.length > 1 ? queue.shift() : queue?.[0]) ?? {
      error: new Error('unexpected call'),
    };
    return 'value' in next ? Promise.resolve(next.value) : Promise.reject(next.error);
  });
}

function openLink(fragment: string) {
  window.history.replaceState(null, '', `/signup/verify${fragment}`);
}

const verifyCalls = () =>
  apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.verifySignup);

async function setPassword(
  user: ReturnType<typeof userEvent.setup>,
  password = PASSWORD,
  again = password,
) {
  await user.type(await screen.findByLabelText('Mật khẩu'), password);
  await user.type(screen.getByLabelText('Nhập lại mật khẩu'), again);
  await user.click(screen.getByRole('button', { name: 'Tạo tài khoản và workspace' }));
}

beforeEach(() => {
  apiMock.mockReset();
  router.replace.mockReset();
  openLink(`#token=${TOKEN}`);
});

describe('VerifySignup (ADR-026)', () => {
  it('shows the email and the names typed, and uses nothing up by opening', async () => {
    answer({});
    renderWithProviders(<VerifySignup />);

    const email = await screen.findByRole('textbox', { name: 'Email' });
    expect(email).toHaveValue(SIGNUP.email);
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Họ và tên' })).toHaveValue('Ngọc Anh');
    expect(screen.getByRole('textbox', { name: 'Tên workspace' })).toHaveValue('Mây Xanh Agency');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('');
    expect(lastCallTo(apiMock, endpoints.lookupSignup).options).toEqual({
      body: { token: TOKEN },
    });
    // Opening the link, as a mail scanner may, creates nothing.
    expect(verifyCalls()).toEqual([]);
  });

  it('creates the account with the password and names chosen here, then opens it', async () => {
    const user = userEvent.setup();
    answer({});
    const { queryClient } = renderWithProviders(<VerifySignup />);
    queryClient.setQueryData(['stale'], 'from another session');

    const name = await screen.findByRole('textbox', { name: 'Họ và tên' });
    await user.clear(name);
    await user.type(name, 'Trần Ngọc Anh');
    await setPassword(user);

    expect(lastCallTo(apiMock, endpoints.verifySignup).options).toEqual({
      body: {
        token: TOKEN,
        name: 'Trần Ngọc Anh',
        workspaceName: 'Mây Xanh Agency',
        password: PASSWORD,
      },
    });
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
    expect(queryClient.getQueryData(['stale'])).toBeUndefined();
    // The used link is not asked about again while the workspace opens.
    expect(await screen.findByText('Đang mở workspace')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.lookupSignup),
    ).toHaveLength(1);
  });

  it('asks again when the two passwords differ, and sends nothing', async () => {
    const user = userEvent.setup();
    answer({});
    renderWithProviders(<VerifySignup />);

    await setPassword(user, PASSWORD, 'mat-khau-khac-123');

    const again = screen.getByLabelText('Nhập lại mật khẩu');
    expect(again).toHaveAccessibleDescription('Hai mật khẩu chưa khớp');
    expect(again).toHaveFocus();
    expect(verifyCalls()).toEqual([]);
  });

  it('takes the sign-up rules for the password and the names', async () => {
    const user = userEvent.setup();
    answer({});
    renderWithProviders(<VerifySignup />);
    await user.clear(await screen.findByRole('textbox', { name: 'Tên workspace' }));

    await setPassword(user, 'ngan');

    expect(screen.getByRole('textbox', { name: 'Tên workspace' })).toHaveAccessibleDescription(
      expect.stringContaining('Nhập tên workspace'),
    );
    expect(screen.getByRole('textbox', { name: 'Tên workspace' })).toHaveFocus();
    expect(screen.getByLabelText('Mật khẩu')).toHaveAccessibleDescription(
      expect.stringContaining('Mật khẩu cần ít nhất 8 ký tự'),
    );
    expect(verifyCalls()).toEqual([]);
  });

  it('puts a server field error on its field', async () => {
    const user = userEvent.setup();
    answer({
      verify: [
        {
          error: apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
            { path: ['password'], code: 'too_small', message: 'Mật khẩu cần ít nhất 8 ký tự' },
          ]),
        },
      ],
    });
    renderWithProviders(<VerifySignup />);

    await setPassword(user);

    const password = screen.getByLabelText('Mật khẩu');
    await vi.waitFor(() => {
      expect(password).toHaveAccessibleDescription(
        expect.stringContaining('Mật khẩu cần ít nhất 8 ký tự'),
      );
    });
    expect(password).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers to sign up again, or to log in, when the link was used or expired', async () => {
    answer({
      lookup: [
        { error: apiError(410, 'signup_link_invalid', 'Link xác nhận không còn dùng được') },
      ],
    });
    renderWithProviders(<VerifySignup />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Link xác nhận không còn dùng được');
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveAttribute('href', '/signup');
    // Confirmed already, on another device say: signing up again would only say so by email.
    expect(screen.getByText('Nếu bạn đã xác nhận email này, hãy đăng nhập.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('Mật khẩu')).toBeNull();
  });

  it('says so when the link stopped working while the page was open', async () => {
    const user = userEvent.setup();
    answer({
      verify: [
        { error: apiError(410, 'signup_link_invalid', 'Link xác nhận không còn dùng được') },
      ],
    });
    renderWithProviders(<VerifySignup />);

    await setPassword(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Link xác nhận không còn dùng được');
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Tạo tài khoản và workspace' })).toBeNull();
  });

  it('sends an email that got an account meanwhile to the login page', async () => {
    const user = userEvent.setup();
    answer({ verify: [{ error: apiError(409, 'email_taken', 'Email này đã có tài khoản') }] });
    renderWithProviders(<VerifySignup />);

    await setPassword(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email này đã có tài khoản');
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('keeps the form for another try after a failure on our side', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    answer({ verify: [{ error: new TypeError('Failed to fetch') }, { value: ME }] });
    renderWithProviders(<VerifySignup />);

    await setPassword(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue(PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản và workspace' }));
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });
  });

  it('looks the link up again after a failure on our side', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    answer({ lookup: [{ error: new TypeError('Failed to fetch') }, { value: SIGNUP }] });
    renderWithProviders(<VerifySignup />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByRole('textbox', { name: 'Email' })).toHaveValue(SIGNUP.email);
  });

  it('takes another link opened in the same tab', async () => {
    const user = userEvent.setup();
    const other = 'b'.repeat(43);
    answer({
      lookup: [
        { error: apiError(410, 'signup_link_invalid', 'Link xác nhận không còn dùng được') },
        { value: { ...SIGNUP, workspaceName: 'Bếp Nhà Lá' } },
      ],
    });
    renderWithProviders(<VerifySignup />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Only the fragment changes, so the page is not loaded again.
    act(() => {
      openLink(`#token=${other}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('textbox', { name: 'Tên workspace' })).toHaveValue('Bếp Nhà Lá');
    expect(screen.queryByRole('alert')).toBeNull();
    await setPassword(user);
    expect(lastCallTo(apiMock, endpoints.verifySignup).options).toMatchObject({
      body: { token: other },
    });
  });

  it('explains a link without its secret, and asks the API nothing', () => {
    openLink('');
    renderWithProviders(<VerifySignup />);
    expect(screen.getByText('Liên kết không đầy đủ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký lại' })).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('button')).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
