import { type Access, endpoints, type Membership } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { TemplateDetailScreen } from './TemplateDetailScreen';
import { detailFixture, readinessFixture } from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};
const smile = siteFixture({ name: 'Smile Care' });

function renderDetail(
  options: {
    role?: Access;
    siteLimited?: boolean;
    template?: ReturnType<typeof detailFixture>;
    siteId?: string | null;
  } = {},
) {
  return renderWithProviders(
    <TemplateDetailScreen
      workspace={workspace}
      role={options.role ?? 'owner'}
      siteLimited={options.siteLimited ?? false}
      template={options.template ?? detailFixture()}
      sites={[smile]}
      siteId={options.siteId === undefined ? SITE_ID : options.siteId}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.slugAvailability) {
      const { slug } = (options as { query: { slug: string } }).query;
      return Promise.resolve({ slug, available: true, reason: null, message: null });
    }
    return Promise.reject(new Error('unexpected call'));
  });
});

describe('TemplateDetailScreen', () => {
  it('shows the template, its sections, what the site needs and its facts (board 18)', () => {
    renderDetail();
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?site=${SITE_ID}`,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ưu đãi dịch vụ nha khoa' }),
    ).toBeInTheDocument();
    expect(screen.getByText('HỆ THỐNG')).toBeInTheDocument();
    expect(screen.getByText('Thu lead tư vấn')).toBeInTheDocument();
    expect(screen.getByText('Nha khoa & y tế')).toBeInTheDocument();

    const outline = screen.getByRole('region', { name: 'Gồm 8 section' });
    expect(
      within(outline)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Thanh điều hướng · nút đặt lịch',
      'Hero · ưu đãi và nút đặt lịch',
      'Lợi ích · 3 lý do chọn phòng khám',
      'Giới thiệu bác sĩ',
      'Cảm nhận khách hàng',
      'Câu hỏi thường gặp',
      'Form đăng ký tư vấn',
      'Chân trang · địa chỉ, giờ mở cửa',
    ]);

    const needs = screen.getByRole('region', { name: 'Cần có trước khi xuất bản' });
    expect(
      within(needs)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Nơi nhận lead · Smile Care đã có ngocanh@mayxanh.vn',
      'Nội dung đồng ý · Smile Care đang dùng phiên bản 3',
      'Ảnh của bạn · mẫu để trống khung ảnh, nên thêm ảnh thật của bạn',
    ]);

    const facts = screen
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(facts).toEqual([
      ['Phiên bản', 'v1 · cập nhật 02/11/2026'],
      ['Theme', 'Bạc hà · 4 color scheme đạt AA'],
      ['Đã dùng', '3 trang trong workspace'],
    ]);
  });

  it('previews the real page on a computer, then on a phone', async () => {
    const user = userEvent.setup();
    renderDetail();
    const desktop = screen.getByRole('region', {
      name: 'Bản xem trước trên máy tính: Ưu đãi dịch vụ nha khoa',
    });
    // The sections' own components, with the template's sample copy.
    expect(
      within(desktop).getByText('Tẩy trắng răng giảm 30% cho khách hàng mới'),
    ).toBeInTheDocument();
    expect(within(desktop).getByText('Đặt lịch tư vấn miễn phí')).toBeInTheDocument();
    expect(within(desktop).queryByRole('link')).toBeNull();
    expect(within(desktop).queryByRole('textbox')).toBeNull();

    const devices = screen.getByRole('group', { name: 'Xem theo thiết bị' });
    expect(within(devices).getByRole('button', { name: 'Máy tính' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(devices).getByRole('button', { name: 'Điện thoại' }));
    expect(
      screen.getByRole('region', {
        name: 'Bản xem trước trên điện thoại: Ưu đãi dịch vụ nha khoa',
      }),
    ).toHaveAttribute('data-device', 'mobile');
  });

  it('opens "Tạo trang từ mẫu" with what the chosen site needs, without asking again', async () => {
    const user = userEvent.setup();
    renderDetail({
      template: detailFixture('nha-khoa-uu-dai', {
        site: readinessFixture({ confirmedRecipients: 0, recipientEmail: null }),
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Tạo trang từ mẫu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo trang từ mẫu' });
    expect(within(dialog).getByRole('note')).toHaveTextContent('Smile Care chưa có nơi nhận lead.');
    expect(apiMock.mock.calls.some(([endpoint]) => endpoint === endpoints.getTemplate)).toBe(false);
  });

  it('lets roles that do not edit pages look, and says who creates', () => {
    renderDetail({ role: 'viewer', siteLimited: true });
    expect(screen.queryByRole('button', { name: 'Tạo trang từ mẫu' })).toBeNull();
    expect(
      screen.getByText(
        'Chỉ Chủ sở hữu, Quản trị, Biên tập và Cộng tác viên tạo được trang từ mẫu.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('3 trang trong các site của bạn')).toBeInTheDocument();
  });

  it('says what any site needs when there is no site to check, and the default theme', () => {
    renderDetail({ siteId: null, template: detailFixture('nha-khoa-uu-dai', { site: null }) });
    const needs = screen.getByRole('region', { name: 'Cần có trước khi xuất bản' });
    expect(within(needs).getAllByRole('listitem')[0]).toHaveTextContent(
      'Nơi nhận lead · site cần một email nhận lead đã xác nhận',
    );
    expect(screen.getByRole('region', { name: /Bản xem trước trên máy tính/ })).toHaveTextContent(
      'Tên site',
    );
  });
});
