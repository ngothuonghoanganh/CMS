import { type Access, endpoints, type Membership } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  pageFixture,
  pageListFixture,
  SITE_ID,
  siteFixture,
  WORKSPACE_ID,
} from '../dashboard/test-fixtures';
import { PAGE_ID, pageDetail, sampleComposition } from '../editor/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { TemplateDetailScreen } from './TemplateDetailScreen';
import { detailFixture, readinessFixture, WORKSPACE_TEMPLATE_ID } from './test-fixtures';

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
      ['Phiên bản', 'v2 · cập nhật 04/11/2026'],
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

  it('applies the template to a page of the site with its revision, then opens the editor (G3)', async () => {
    const user = userEvent.setup();
    const live = pageFixture({
      id: PAGE_ID,
      status: { kind: 'live_with_changes', changeCount: 2, changes: [] },
    });
    const detail = pageDetail(sampleComposition(), {
      liveRelease: live.liveRelease,
      latestVersion: 12,
    });
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.listPages) {
        return Promise.resolve(pageListFixture([live]));
      }
      if (endpoint === endpoints.getPage) {
        return Promise.resolve(detail);
      }
      if (endpoint === endpoints.applyTemplate) {
        return Promise.resolve(detail);
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' });
    expect(await within(dialog).findByRole('combobox', { name: 'Trang' })).toHaveTextContent(
      'Ưu đãi niềng răng tháng 11 · Live · Có thay đổi',
    );
    // Only "Thay toàn bộ section", with the real counts; "Chỉ đổi theme" is not offered (ADR-030).
    const replace = await within(dialog).findByRole('radio', { name: 'Thay toàn bộ section' });
    expect(replace).toBeChecked();
    expect(within(dialog).getAllByRole('radio')).toHaveLength(1);
    expect(
      await within(dialog).findByText(
        /5 section hiện có trong bản nháp được thay bằng 8 section của mẫu, kèm chữ mẫu\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Trang live v12, tên trang, đường dẫn, SEO\./),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Hoàn tác được')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Thay bản nháp và mở editor' }));
    expect(lastCallTo(apiMock, endpoints.applyTemplate)).toEqual({
      args: [SITE_ID, PAGE_ID],
      options: {
        body: {
          baseRevision: 3,
          template: { source: 'system', templateId: 'nha-khoa-uu-dai', version: 2 },
        },
      },
    });
    expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
  });

  it('shows an earlier version of a workspace template, and an archived one, without making pages', () => {
    const earlier = detailFixture('nha-khoa-uu-dai', {
      id: WORKSPACE_TEMPLATE_ID,
      source: 'workspace',
      version: 1,
      currentVersion: 3,
    });
    const { unmount } = renderDetail({ template: earlier });
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang xem v1\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem v3' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates/${WORKSPACE_TEMPLATE_ID}?site=${SITE_ID}`,
    );
    expect(screen.queryByRole('button', { name: 'Tạo trang từ mẫu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Áp dụng vào trang đang sửa…' })).toBeNull();
    unmount();

    renderDetail({
      template: detailFixture('nha-khoa-uu-dai', {
        id: WORKSPACE_TEMPLATE_ID,
        source: 'workspace',
        archived: true,
      }),
    });
    expect(screen.getByRole('link', { name: 'Template của workspace' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?source=workspace&archived=1`,
    );
    expect(screen.queryByRole('button', { name: 'Tạo trang từ mẫu' })).toBeNull();
  });

  it('asks only roles with templates.manage to restore an archived template', () => {
    const archived = detailFixture('nha-khoa-uu-dai', {
      id: WORKSPACE_TEMPLATE_ID,
      source: 'workspace',
      archived: true,
    });
    const { unmount } = renderDetail({ template: archived, role: 'editor' });
    expect(screen.getByText(/Mẫu này đã được lưu trữ\. Khôi phục ở/)).toBeInTheDocument();
    unmount();

    renderDetail({ template: archived, role: 'contributor' });
    expect(
      screen.getByText(
        'Mẫu này đã được lưu trữ. Chỉ Chủ sở hữu, Quản trị và Biên tập khôi phục được mẫu.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Khôi phục ở/)).toBeNull();
  });

  it('keeps the apply dialog open to say the template was archived meanwhile', async () => {
    const user = userEvent.setup();
    const live = pageFixture({ id: PAGE_ID });
    const own = detailFixture('nha-khoa-uu-dai', {
      id: WORKSPACE_TEMPLATE_ID,
      source: 'workspace',
    });
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.listPages) {
        return Promise.resolve(pageListFixture([live]));
      }
      if (endpoint === endpoints.getPage) {
        return Promise.resolve(pageDetail(sampleComposition()));
      }
      if (endpoint === endpoints.applyTemplate) {
        return Promise.reject(
          apiError(409, 'template_archived', 'Mẫu “Ưu đãi dịch vụ nha khoa” đã được lưu trữ'),
        );
      }
      return Promise.reject(new Error('unexpected call'));
    });
    router.refresh.mockReset();
    const { rerender, queryClient } = renderDetail({ template: own });
    await user.click(screen.getByRole('button', { name: 'Áp dụng vào trang đang sửa…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' });
    const submit = within(dialog).getByRole('button', { name: 'Thay bản nháp và mở editor' });
    await vi.waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await user.click(submit);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Mẫu “Ưu đãi dịch vụ nha khoa” đã được lưu trữ. Khôi phục mẫu ở “Template của workspace” để dùng lại.',
    );
    expect(submit).toBeDisabled();
    expect(router.refresh).toHaveBeenCalledOnce();

    // The refresh renders the template archived: the dialog stays until the user closes it.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TemplateDetailScreen
            workspace={workspace}
            role="owner"
            siteLimited={false}
            template={{ ...own, archived: true }}
            sites={[smile]}
            siteId={SITE_ID}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Áp dụng mẫu vào trang đang sửa' }),
    ).toHaveTextContent('đã được lưu trữ');
  });

  it('offers a template limited to other sites to none of the member’s sites', () => {
    renderDetail({
      template: detailFixture('nha-khoa-uu-dai', {
        id: WORKSPACE_TEMPLATE_ID,
        source: 'workspace',
        siteIds: [],
      }),
    });
    expect(screen.queryByRole('button', { name: 'Tạo trang từ mẫu' })).toBeNull();
    expect(
      screen.getByText('Mẫu này chỉ dùng cho các site đã chọn khi lưu, không có site nào của bạn.'),
    ).toBeInTheDocument();
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
