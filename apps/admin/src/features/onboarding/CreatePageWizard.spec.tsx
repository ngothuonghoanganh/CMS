import { endpoints, type SlugAvailability } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { CreatePageWizard } from './CreatePageWizard';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const NEW_PAGE_ID = '64b000000000000000000777';

function available(slug: string): SlugAvailability {
  return { slug, available: true, reason: null, message: null };
}

/** Slug checks answer "free"; creating returns the new page unless a test overrides it. */
function serve(
  create: () => Promise<unknown> = () => Promise.resolve({ page: { id: NEW_PAGE_ID } }),
) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.slugAvailability) {
      const query = (options as { query: { slug: string } }).query;
      return Promise.resolve(available(query.slug));
    }
    if (endpoint === endpoints.createPage) {
      return create();
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function renderWizard() {
  return renderWithProviders(<CreatePageWizard site={siteFixture()} />);
}

function currentStep(): string | null {
  const stepper = screen.getByRole('list', { name: 'Các bước tạo trang' });
  const current = stepper.querySelector('[aria-current="step"]');
  return current?.textContent ?? null;
}

beforeEach(() => {
  apiMock.mockReset();
  router.push.mockReset();
});

describe('CreatePageWizard', () => {
  it('starts with the goals, the outline and the close link', () => {
    serve();
    renderWizard();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Trang này dùng để làm gì?' }),
    ).toBeInTheDocument();
    expect(currentStep()).toBe('1Mục tiêu');
    expect(screen.getByRole('radio', { name: 'Thu lead tư vấn' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'Đóng và quay lại danh sách trang' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}`,
    );
    const outline = screen.getByRole('complementary', { name: 'Trang sẽ gồm' });
    expect(within(outline).getByText('Hero + nút đặt lịch')).toBeInTheDocument();
    // A lead page collects contacts with the form (ADR-016), as on board 02.
    const form = within(outline).getByText('Form đăng ký tư vấn').closest('li');
    expect(form).toHaveTextContent('Form');
    expect(within(outline).getByText('Form ngắn: Họ và tên + Số điện thoại')).toBeInTheDocument();
    expect(within(outline).getByText('Ô đồng ý xử lý dữ liệu không tick sẵn')).toBeInTheDocument();
    expect(screen.queryByText('Duyệt thư viện mẫu')).not.toBeInTheDocument();
  });

  it('keeps the phone call defaults for a goal without a form', async () => {
    const user = userEvent.setup();
    serve();
    renderWizard();
    await user.click(screen.getByRole('radio', { name: 'Giới thiệu dịch vụ' }));
    const outline = screen.getByRole('complementary', { name: 'Trang sẽ gồm' });
    expect(within(outline).getByText('Liên hệ nhanh qua điện thoại hoặc Zalo')).toBeInTheDocument();
    expect(within(outline).queryByText('Form ngắn: Họ và tên + Số điện thoại')).toBeNull();
  });

  it('moves through the steps and creates the page from the goal', async () => {
    const user = userEvent.setup();
    serve();
    renderWizard();

    await user.click(screen.getByRole('radio', { name: 'Ưu đãi có thời hạn' }));
    expect(
      within(screen.getByRole('complementary')).getByText('Hero + thời hạn ưu đãi'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    expect(currentStep()).toBe('2Nội dung chính');
    expect(screen.getByRole('heading', { level: 1, name: 'Nội dung chính' })).toHaveFocus();
    const title = screen.getByRole('textbox', { name: /Tên trang/ });
    expect(title).toHaveValue('Ưu đãi có thời hạn');
    await user.clear(title);
    await user.type(title, 'Ưu đãi niềng răng tháng 11');
    expect(screen.getByRole('textbox', { name: /Đường dẫn/ })).toHaveValue(
      'uu-dai-nieng-rang-thang-11',
    );
    await user.type(
      screen.getByRole('textbox', { name: /Ưu đãi hoặc dịch vụ chính/ }),
      'Giảm 30% niềng răng trong suốt',
    );
    await user.type(screen.getByRole('textbox', { name: /Số điện thoại/ }), '0901 234 567');
    const available = await screen.findByText('Đường dẫn này dùng được.');
    expect(available).toBeVisible();
    // The result also reaches screen readers while they keep typing (WCAG 4.1.3).
    expect(available.closest('[aria-live="polite"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    expect(currentStep()).toBe('3Phong cách');
    await user.click(screen.getByRole('radio', { name: 'Nổi bật' }));
    await user.click(screen.getByRole('button', { name: 'Tạo trang' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${NEW_PAGE_ID}/edit`);
    });
    expect(lastCallTo(apiMock, endpoints.createPage)).toEqual({
      args: [SITE_ID],
      options: {
        body: {
          title: 'Ưu đãi niềng răng tháng 11',
          slug: 'uu-dai-nieng-rang-thang-11',
          start: {
            kind: 'goal',
            goal: 'promo',
            brief: { offer: 'Giảm 30% niềng răng trong suốt', audience: '', phone: '0901 234 567' },
            style: 'bold',
          },
        },
      },
    });
  });

  it('keeps the user on the content step while a field is invalid', async () => {
    const user = userEvent.setup();
    serve();
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    await user.clear(screen.getByRole('textbox', { name: /Tên trang/ }));
    await user.type(screen.getByRole('textbox', { name: /Số điện thoại/ }), 'gọi em');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    expect(currentStep()).toBe('2Nội dung chính');
    expect(screen.getByText('Nhập tên trang')).toBeInTheDocument();
    expect(
      screen.getByText('Số điện thoại chỉ gồm chữ số, dấu + và khoảng trắng'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Tên trang/ })).toHaveFocus();
  });

  it('returns to the content step when the slug was taken meanwhile', async () => {
    const user = userEvent.setup();
    serve(() =>
      Promise.reject(
        apiError(409, 'slug_taken', 'Đường dẫn đã được trang khác dùng', [
          { path: ['slug'], code: 'slug_taken', message: 'Đường dẫn đã được trang khác dùng' },
        ]),
      ),
    );
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.click(screen.getByRole('button', { name: 'Tạo trang' }));

    expect(await screen.findByText('Đường dẫn đã được trang khác dùng')).toBeInTheDocument();
    expect(currentStep()).toBe('2Nội dung chính');
    expect(screen.getByRole('textbox', { name: /Đường dẫn/ })).toHaveFocus();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('explains the page limit in the footer', async () => {
    const user = userEvent.setup();
    serve(() => Promise.reject(apiError(409, 'page_limit_reached', 'Site đã có tối đa 200 trang')));
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await screen.findByText('Đường dẫn này dùng được.');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.click(screen.getByRole('button', { name: 'Tạo trang' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Site đã có tối đa 200 trang');
    expect(currentStep()).toBe('3Phong cách');
  });

  it('goes back a step', async () => {
    const user = userEvent.setup();
    serve();
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.click(screen.getByRole('button', { name: 'Quay lại' }));
    expect(currentStep()).toBe('1Mục tiêu');
    expect(screen.getByRole('radio', { name: 'Thu lead tư vấn' })).toBeChecked();
  });

  it('creates a blank page from "Bắt đầu trống"', async () => {
    const user = userEvent.setup();
    serve();
    renderWizard();

    await user.click(screen.getByRole('button', { name: 'Bắt đầu trống' }));
    const dialog = screen.getByRole('dialog', { name: 'Bắt đầu trống' });
    await user.click(within(dialog).getByRole('button', { name: 'Tạo trang trống' }));
    expect(within(dialog).getByText('Nhập tên trang')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: /Tên trang/ }), 'Bảng giá');
    expect(within(dialog).getByRole('textbox', { name: /Đường dẫn/ })).toHaveValue('bang-gia');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo trang trống' }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${NEW_PAGE_ID}/edit`);
    });
    expect(apiMock).toHaveBeenCalledWith(endpoints.createPage, [SITE_ID], {
      body: { title: 'Bảng giá', slug: 'bang-gia', start: { kind: 'blank' } },
    });
  });
});
