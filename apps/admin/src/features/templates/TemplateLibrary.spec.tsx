import { type Access, endpoints, type Membership, type TemplateSummary } from '@plp/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import type { LibraryTab } from './library-filters';
import { TemplateLibrary } from './TemplateLibrary';
import { readinessFixture, templateSummaries, workspaceSummaryFixture } from './test-fixtures';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const KITCHEN_ID = '64b000000000000000000002';

const workspace: Membership['workspace'] = {
  id: WORKSPACE_ID,
  name: 'Mây Xanh Agency',
  slug: 'may-xanh-agency',
};
const smile = siteFixture();
const kitchen = siteFixture({ id: KITCHEN_ID, name: 'Bếp Nhà Mây', themePresetId: 'sunset' });

function renderLibrary(
  options: {
    role?: Access;
    tab?: LibraryTab;
    sites?: (typeof smile)[];
    siteId?: string | null;
    templates?: TemplateSummary[];
  } = {},
) {
  return renderWithProviders(
    <TemplateLibrary
      workspace={workspace}
      role={options.role ?? 'owner'}
      templates={options.templates ?? templateSummaries}
      sites={options.sites ?? [smile, kitchen]}
      initialSiteId={options.siteId === undefined ? KITCHEN_ID : options.siteId}
      tab={options.tab ?? 'all'}
    />,
  );
}

function cardNames(): string[] {
  return within(screen.getByRole('region', { name: 'Kết quả' }))
    .queryAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.slugAvailability) {
      const { slug } = (options as { query: { slug: string } }).query;
      return Promise.resolve({ slug, available: true, reason: null, message: null });
    }
    if (endpoint === endpoints.getTemplate) {
      return Promise.resolve({ site: readinessFixture({ siteId: KITCHEN_ID }) });
    }
    return Promise.reject(new Error('unexpected call'));
  });
});

describe('TemplateLibrary', () => {
  it('lists every template as a card, with the tabs, the filters and the site to create for', () => {
    renderLibrary();
    expect(screen.getByRole('heading', { level: 1, name: 'Templates' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Nguồn mẫu' });
    expect(within(tabs).getByRole('link', { name: 'Tất cả · 12' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Hệ thống · 12' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?source=system&site=${KITCHEN_ID}`,
    );
    expect(screen.getByRole('combobox', { name: 'Tạo trang cho' })).toHaveValue(KITCHEN_ID);
    expect(cardNames()).toEqual(templateSummaries.map((template) => template.name));
    expect(screen.getByRole('status')).toHaveTextContent('12 mẫu');

    const card = screen.getByRole('article', { name: 'Ưu đãi dịch vụ nha khoa' });
    expect(
      within(card).getByRole('img', { name: 'Bản xem thu nhỏ: Ưu đãi dịch vụ nha khoa' }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent('HỆ THỐNG');
    expect(card).toHaveTextContent('Có form');
    expect(card).toHaveTextContent('Thu lead tư vấn · 8 section');
    expect(
      within(card).getByRole('link', { name: 'Xem trước Ưu đãi dịch vụ nha khoa' }),
    ).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates/nha-khoa-uu-dai?site=${KITCHEN_ID}`,
    );
    expect(
      within(card).getByRole('button', { name: 'Dùng mẫu Ưu đãi dịch vụ nha khoa' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('article', { name: 'Thực đơn mới & đặt bàn' })).queryByText(
        'Có form',
      ),
    ).toBeNull();
  });

  it('finds templates without accents, and counts what it shows', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.type(screen.getByRole('searchbox', { name: 'Tìm template' }), 'the hinh');
    expect(cardNames()).toEqual([
      'Ưu đãi khai trương phòng tập',
      'Gói tập cá nhân với huấn luyện viên',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('2 mẫu');
  });

  it('filters by goal, industry and form, with removable chips', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const filters = screen.getByRole('complementary', { name: 'Bộ lọc' });
    const goals = within(filters).getByRole('group', { name: 'MỤC TIÊU' });
    const industries = within(filters).getByRole('group', { name: 'NGÀNH' });
    expect(
      within(goals).getByRole('checkbox', { name: 'Thu lead tư vấn 3 mẫu' }),
    ).toBeInTheDocument();

    await user.click(within(goals).getByRole('checkbox', { name: /Sự kiện \/ webinar/ }));
    await user.click(within(industries).getByRole('checkbox', { name: /Bất động sản/ }));
    expect(cardNames()).toEqual(['Sự kiện mở bán dự án']);
    // Within "Bất động sản", the other goals say what they would show.
    expect(within(goals).getByRole('checkbox', { name: 'Danh sách chờ 1 mẫu' })).not.toBeChecked();

    const results = screen.getByRole('region', { name: 'Kết quả' });
    expect(results).toHaveTextContent('Đang lọc:');
    await user.click(within(results).getByRole('button', { name: 'Bỏ lọc Sự kiện / webinar' }));
    expect(cardNames()).toEqual(['Sự kiện mở bán dự án', 'Danh sách chờ ra mắt dự án']);
    expect(within(goals).getByRole('checkbox', { name: /Sự kiện \/ webinar/ })).not.toBeChecked();
    // Focus moves to the chip now in its place.
    expect(within(results).getByRole('button', { name: 'Bỏ lọc Bất động sản' })).toHaveFocus();

    await user.click(within(filters).getByRole('checkbox', { name: /Có form thu lead/ }));
    expect(cardNames()).toEqual(['Sự kiện mở bán dự án', 'Danh sách chờ ra mắt dự án']);
    await user.click(within(results).getByRole('button', { name: 'Bỏ lọc Có form thu lead' }));
    await user.click(within(results).getByRole('button', { name: 'Bỏ lọc Bất động sản' }));
    // The last chip gone, focus is back on the search.
    expect(screen.getByRole('searchbox', { name: 'Tìm template' })).toHaveFocus();
    expect(cardNames()).toHaveLength(12);
  });

  it('says why nothing matches, and clears the filters', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const filters = screen.getByRole('complementary', { name: 'Bộ lọc' });
    await user.click(within(filters).getByRole('checkbox', { name: /Giới thiệu doanh nghiệp/ }));
    await user.click(within(filters).getByRole('checkbox', { name: /Bất động sản/ }));
    expect(
      screen.getByRole('heading', {
        name: 'Chưa có mẫu “Giới thiệu doanh nghiệp” cho ngành Bất động sản',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 mẫu');
    await user.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(cardNames()).toHaveLength(12);
    expect(screen.getByRole('searchbox', { name: 'Tìm template' })).toHaveFocus();
  });

  it('lets roles that do not edit pages browse, and says who creates', () => {
    renderLibrary({ role: 'viewer' });
    expect(screen.queryByRole('combobox', { name: 'Tạo trang cho' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Dùng mẫu/ })).toBeNull();
    expect(
      screen.getByText(
        'Bạn xem được mọi mẫu. Chỉ Chủ sở hữu, Quản trị, Biên tập và Cộng tác viên tạo được trang từ mẫu.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Xem trước/ })).toHaveLength(12);
  });

  it('offers a first site to a workspace without one', () => {
    renderLibrary({ sites: [], siteId: null });
    expect(screen.getByText(/Chưa có site nào để tạo trang/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo site' })).toHaveAttribute(
      'href',
      `/sites/new?workspace=${WORKSPACE_ID}`,
    );
    expect(screen.queryByRole('button', { name: /^Dùng mẫu/ })).toBeNull();
  });

  it('opens "Tạo trang từ mẫu" for the site chosen, from "Dùng mẫu"', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tạo trang cho' }), SITE_ID);
    await user.click(screen.getByRole('button', { name: 'Dùng mẫu Webinar trực tuyến' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo trang từ mẫu' });
    expect(within(dialog).getByRole('combobox', { name: 'Site' })).toHaveValue(SITE_ID);
    expect(within(dialog).getByRole('textbox', { name: /Tên trang/ })).toHaveValue(
      'Webinar trực tuyến',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('lists the workspace’s own templates with their source, and uses them only in their sites (G2)', () => {
    const own = workspaceSummaryFixture();
    const smileOnly = workspaceSummaryFixture({
      id: '64b0000000000000000000f2',
      name: 'Chỉ cho Smile Care',
      siteIds: [SITE_ID],
    });
    renderLibrary({ templates: [...templateSummaries, own, smileOnly] });
    const tabs = screen.getByRole('navigation', { name: 'Nguồn mẫu' });
    // "Của workspace" leads to board 19, the workspace's own templates.
    expect(within(tabs).getByRole('link', { name: 'Của workspace · 2' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?source=workspace&site=${KITCHEN_ID}`,
    );
    const card = screen.getByRole('article', { name: 'Tư vấn niềng răng trả góp' });
    expect(within(card).getByText('WORKSPACE')).toBeInTheDocument();
    expect(
      within(card).getByText('Thu lead tư vấn · 8 section · Mây Xanh Agency'),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: 'Dùng mẫu Tư vấn niềng răng trả góp' }),
    ).toBeInTheDocument();
    // "Tạo trang cho" is Bếp Nhà Mây, which may not use the second one.
    const limited = screen.getByRole('article', { name: 'Chỉ cho Smile Care' });
    expect(within(limited).queryByRole('button', { name: /Dùng mẫu/ })).toBeNull();
    expect(
      within(limited).getByText('Mẫu này chỉ dùng cho các site đã chọn khi lưu.'),
    ).toBeInTheDocument();
  });

  it('marks the tab of the source being shown', () => {
    renderLibrary({ tab: 'system' });
    const tabs = screen.getByRole('navigation', { name: 'Nguồn mẫu' });
    expect(within(tabs).getByRole('link', { name: 'Hệ thống · 12' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Tất cả · 12' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?site=${KITCHEN_ID}`,
    );
  });
});
