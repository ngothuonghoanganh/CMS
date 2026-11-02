import { type Access, endpoints, type Membership, type WorkspaceTemplate } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  draftPageFixture,
  pageFixture,
  pageListFixture,
  SITE_ID,
  siteFixture,
  WORKSPACE_ID,
} from '../dashboard/test-fixtures';
import { PAGE_ID, pageDetail } from '../editor/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { templateQueryKeys } from './queries';
import { versionFixtures, WORKSPACE_TEMPLATE_ID, workspaceTemplateFixture } from './test-fixtures';
import { WorkspaceTemplatesScreen } from './WorkspaceTemplatesScreen';

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
const smile = siteFixture();
const kitchen = siteFixture({ id: '64b000000000000000000002', name: 'Bếp Nhà Mây' });
const own = workspaceTemplateFixture();
const kitchenMenu = workspaceTemplateFixture({
  id: '64b0000000000000000000f2',
  name: 'Thực đơn mới & đặt bàn',
  goal: 'product',
  industry: 'food_beverage',
  scope: { kind: 'sites', siteIds: [kitchen.id] },
  currentVersion: 1,
  usedCount: 0,
});
const stored = workspaceTemplateFixture({
  id: '64b0000000000000000000f3',
  name: 'Lớp thử miễn phí',
  archived: true,
});

function screenOf(
  options: { role?: Access; archived?: boolean; templates?: WorkspaceTemplate[] } = {},
) {
  return (
    <WorkspaceTemplatesScreen
      workspace={workspace}
      role={options.role ?? 'owner'}
      templates={options.templates ?? [own, kitchenMenu, stored]}
      sites={[smile, kitchen]}
      initialSiteId={SITE_ID}
      archived={options.archived ?? false}
    />
  );
}

function renderScreen(
  options: { role?: Access; archived?: boolean; templates?: WorkspaceTemplate[] } = {},
) {
  const rendered = renderWithProviders(screenOf(options));
  return {
    ...rendered,
    /** The server's render after `router.refresh()`, with the templates as they are now. */
    refreshed: (templates: WorkspaceTemplate[]) => {
      rendered.rerender(
        <QueryClientProvider client={rendered.queryClient}>
          <ToastProvider>{screenOf({ ...options, templates })}</ToastProvider>
        </QueryClientProvider>,
      );
    },
  };
}

const menuOf = (name: string) =>
  screen.getByRole('button', { name: `Sửa thông tin, nhân bản hoặc lưu trữ ${name}` });

beforeEach(() => {
  apiMock.mockReset();
  router.refresh.mockReset();
  apiMock.mockImplementation(() => Promise.reject(new Error('unexpected call')));
});

describe('WorkspaceTemplatesScreen (board 19)', () => {
  it('lists the templates in use with their version, sites, pages and last change', () => {
    renderScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Template của workspace' }),
    ).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Trạng thái' });
    expect(within(tabs).getByRole('link', { name: 'Đang dùng · 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Lưu trữ · 1' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?source=workspace&archived=1`,
    );

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      [
        'Tư vấn niềng răng trả gópThu lead tư vấn · Nha khoa & y tế',
        'v2',
        'Toàn workspace',
        '3 trang',
        '12/10 · Ngọc Anh',
        'Phiên bản của Tư vấn niềng răng trả góp',
      ],
      [
        'Thực đơn mới & đặt bànGiới thiệu dịch vụ · Nhà hàng & F&B',
        'v1',
        'Bếp Nhà Mây',
        'Chưa dùng',
        '12/10 · Ngọc Anh',
        'Phiên bản của Thực đơn mới & đặt bàn',
      ],
    ]);
    expect(within(table).getByRole('link', { name: 'Tư vấn niềng răng trả góp' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates/${WORKSPACE_TEMPLATE_ID}?site=${SITE_ID}`,
    );
    expect(screen.getByRole('button', { name: 'Lưu trang thành template' })).toBeInTheDocument();
  });

  it('lets members without templates.manage look only', () => {
    renderScreen({ role: 'contributor' });
    expect(screen.queryByRole('button', { name: 'Lưu trang thành template' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sửa thông tin, nhân bản/ })).toBeNull();
    expect(
      screen.getByText(/Chỉ Chủ sở hữu, Quản trị và Biên tập lưu và quản lý template/),
    ).toBeInTheDocument();
  });

  it('says how to start when there is no template, and what archiving does', () => {
    renderScreen({ templates: [] });
    expect(screen.getByText('Chưa có template nội bộ')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Lưu trang thành template' })).toHaveLength(2);
  });

  it('archives a template from its menu and restores an archived one', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.archiveWorkspaceTemplate
        ? Promise.resolve({ ...own, archived: true })
        : endpoint === endpoints.restoreWorkspaceTemplate
          ? Promise.resolve({ ...stored, archived: false })
          : Promise.reject(new Error('unexpected call')),
    );
    const { unmount } = renderScreen();
    await user.click(
      screen.getByRole('button', {
        name: 'Sửa thông tin, nhân bản hoặc lưu trữ Tư vấn niềng răng trả góp',
      }),
    );
    expect(screen.getByRole('menuitem', { name: 'Sửa thông tin' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Nhân bản' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Xóa/ })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Lưu trữ' }));
    expect(lastCallTo(apiMock, endpoints.archiveWorkspaceTemplate).args).toEqual([
      WORKSPACE_ID,
      WORKSPACE_TEMPLATE_ID,
    ]);
    expect(await screen.findByText('Đã lưu trữ “Tư vấn niềng răng trả góp”')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    unmount();

    renderScreen({ archived: true });
    expect(screen.getByRole('table')).toHaveTextContent('Lớp thử miễn phí');
    await user.click(
      screen.getByRole('button', { name: 'Sửa thông tin, nhân bản hoặc lưu trữ Lớp thử miễn phí' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Khôi phục' }));
    expect(lastCallTo(apiMock, endpoints.restoreWorkspaceTemplate).args).toEqual([
      WORKSPACE_ID,
      stored.id,
    ]);
  });

  it('archiving moves focus to the next row once the list drops the row, and reads lists again', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.archiveWorkspaceTemplate
        ? Promise.resolve({ ...own, archived: true })
        : Promise.reject(new Error('unexpected call')),
    );
    const { queryClient, refreshed } = renderScreen();
    // The save dialog's "Phiên bản mới của …" and the editor's "Áp dụng mẫu…" read these.
    const lists = [
      templateQueryKeys.all(WORKSPACE_ID),
      [...templateQueryKeys.all(WORKSPACE_ID), 'workspace'],
    ];
    for (const key of lists) {
      queryClient.setQueryData(key, { items: [] });
    }
    await user.click(menuOf(own.name));
    await user.click(screen.getByRole('menuitem', { name: 'Lưu trữ' }));
    expect(await screen.findByText(`Đã lưu trữ “${own.name}”`)).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    for (const key of lists) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }

    refreshed([{ ...own, archived: true }, kitchenMenu, stored]);
    expect(screen.queryByRole('link', { name: own.name })).toBeNull();
    expect(menuOf(kitchenMenu.name)).toHaveFocus();
  });

  it('restoring the last archived template leaves focus on the tab', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.restoreWorkspaceTemplate
        ? Promise.resolve({ ...stored, archived: false })
        : Promise.reject(new Error('unexpected call')),
    );
    const { refreshed } = renderScreen({ archived: true });
    await user.click(menuOf(stored.name));
    await user.click(screen.getByRole('menuitem', { name: 'Khôi phục' }));
    expect(await screen.findByText(`Đã khôi phục “${stored.name}”`)).toBeInTheDocument();

    refreshed([own, kitchenMenu, { ...stored, archived: false }]);
    expect(screen.getByText('Chưa có template nào được lưu trữ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lưu trữ · 0' })).toHaveFocus();
  });

  it('keeps focus on the menu button while a duplicate is made', async () => {
    const user = userEvent.setup();
    let answer: (value: WorkspaceTemplate) => void = () => undefined;
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.duplicateWorkspaceTemplate
        ? new Promise((resolve) => {
            answer = resolve;
          })
        : Promise.reject(new Error('unexpected call')),
    );
    renderScreen();
    await user.click(menuOf(own.name));
    await user.click(screen.getByRole('menuitem', { name: 'Nhân bản' }));
    await waitFor(() => {
      expect(menuOf(own.name)).toHaveFocus();
    });
    // One change at a time: the menus offer none while it runs.
    await user.click(menuOf(kitchenMenu.name));
    expect(screen.getByRole('menuitem', { name: 'Nhân bản' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');
    answer({ ...own, id: '64b0000000000000000000f9', name: `${own.name} (bản sao)` });
    expect(await screen.findByText(`Đã tạo “${own.name} (bản sao)”`)).toBeInTheDocument();
    expect(menuOf(kitchenMenu.name)).toHaveFocus();
  });

  it('shows the versions, previews an earlier one and reuses it as the next version', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.listTemplateVersions
        ? Promise.resolve({ items: versionFixtures })
        : endpoint === endpoints.reuseTemplateVersion
          ? Promise.resolve({ ...own, currentVersion: 3 })
          : Promise.reject(new Error('unexpected call')),
    );
    renderScreen();
    await user.click(
      screen.getByRole('button', { name: 'Phiên bản của Tư vấn niềng răng trả góp' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Tư vấn niềng răng trả góp' });
    const items = await within(dialog).findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('v2ĐANG DÙNG');
    expect(items[0]).toHaveTextContent('Thêm bảng so sánh mắc cài · Ngọc Anh');
    expect(items[0]).toHaveTextContent('Đã tạo 2 trang');
    expect(within(items[0] as HTMLElement).queryByRole('button')).toBeNull();
    expect(items[1]).toHaveTextContent('Lưu từ trang “Niềng răng tháng 9” · Quốc Bảo');
    expect(
      within(items[1] as HTMLElement).getByRole('link', { name: 'Xem trước v1' }),
    ).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates/${WORKSPACE_TEMPLATE_ID}?site=${SITE_ID}&version=1`,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Dùng lại v1' }));
    expect(lastCallTo(apiMock, endpoints.reuseTemplateVersion)).toEqual({
      args: [WORKSPACE_ID, WORKSPACE_TEMPLATE_ID, '1'],
      options: { body: { baseVersion: 2 } },
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it('says when the registry refused the page saved, which no field shows', async () => {
    const user = userEvent.setup();
    const live = pageFixture({ id: PAGE_ID, title: 'Niềng răng tháng 9' });
    apiMock.mockImplementation((endpoint) => {
      switch (endpoint) {
        case endpoints.listPages:
          return Promise.resolve(pageListFixture([live]));
        case endpoints.getPage:
          return Promise.resolve(
            pageDetail(undefined, { title: 'Niềng răng tháng 9', liveRelease: live.liveRelease }),
          );
        case endpoints.listWorkspaceTemplates:
          return Promise.resolve({ items: [] });
        case endpoints.createWorkspaceTemplate:
          return Promise.reject(
            apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
              {
                path: ['composition', 'sections', 1, 'content', 'heading'],
                code: 'custom',
                message: 'Tiêu đề của Hero quá dài',
              },
            ]),
          );
        default:
          return Promise.reject(new Error('unexpected call'));
      }
    });
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Lưu trang thành template' }));
    const dialog = await screen.findByRole('dialog', { name: 'Lưu trang thành template' });
    expect(await within(dialog).findByRole('combobox', { name: 'Trang nguồn' })).toHaveValue(
      PAGE_ID,
    );
    await within(dialog).findByRole('option', { name: /^Bản live/ });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu template' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tiêu đề của Hero quá dài');
  });

  it('says when a site picked in “Sửa thông tin” was refused, which no field shows', async () => {
    const user = userEvent.setup();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.updateWorkspaceTemplate
        ? Promise.reject(
            apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
              {
                path: ['scope', 'siteIds', 0],
                code: 'custom',
                message: 'Bạn không chọn được site này',
              },
            ]),
          )
        : Promise.reject(new Error('unexpected call')),
    );
    renderScreen();
    await user.click(menuOf(own.name));
    await user.click(screen.getByRole('menuitem', { name: 'Sửa thông tin' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa thông tin template' });
    await user.click(within(dialog).getByRole('button', { name: 'Lưu thông tin' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bạn không chọn được site này',
    );
  });

  it('saves a page of a site as a new template, its texts marked as sample', async () => {
    const user = userEvent.setup();
    const live = pageFixture({ id: PAGE_ID, title: 'Niềng răng tháng 9' });
    const draft = draftPageFixture({ id: '64b000000000000000000099' });
    apiMock.mockImplementation((endpoint) => {
      switch (endpoint) {
        case endpoints.listPages:
          return Promise.resolve(pageListFixture([live, draft]));
        case endpoints.getPage:
          return Promise.resolve(
            pageDetail(undefined, {
              title: 'Niềng răng tháng 9',
              goal: 'lead',
              liveRelease: live.liveRelease,
              latestVersion: 12,
            }),
          );
        case endpoints.listWorkspaceTemplates:
          return Promise.resolve({ items: [] });
        case endpoints.createWorkspaceTemplate:
          return Promise.resolve({ ...own, currentVersion: 1 });
        default:
          return Promise.reject(new Error('unexpected call'));
      }
    });
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Lưu trang thành template' }));
    const dialog = await screen.findByRole('dialog', { name: 'Lưu trang thành template' });
    expect(await within(dialog).findByRole('combobox', { name: 'Trang nguồn' })).toHaveValue(
      PAGE_ID,
    );
    const from = within(dialog).getByRole('combobox', { name: 'Lấy từ' });
    expect(await within(from).findByRole('option', { name: 'Bản live v12' })).toBeInTheDocument();
    expect(from).toHaveValue('live');
    expect(within(dialog).getByRole('textbox', { name: /Tên/ })).toHaveValue('Niềng răng tháng 9');
    expect(
      within(dialog).getByRole('radio', { name: /Đánh dấu toàn bộ chữ là chữ mẫu/ }),
    ).toBeChecked();
    expect(within(dialog).getByText(/Không lưu vào template:/)).toBeInTheDocument();

    await user.clear(within(dialog).getByRole('textbox', { name: /Tên/ }));
    await user.type(within(dialog).getByRole('textbox', { name: /Tên/ }), 'Tư vấn niềng răng');
    await user.type(within(dialog).getByRole('textbox', { name: /Có gì mới/ }), 'Bản đầu tiên');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu template' }));
    expect(lastCallTo(apiMock, endpoints.createWorkspaceTemplate)).toEqual({
      args: [WORKSPACE_ID],
      options: {
        body: {
          source: { siteId: SITE_ID, pageId: PAGE_ID, kind: 'live' },
          content: 'sample',
          note: 'Bản đầu tiên',
          name: 'Tư vấn niềng răng',
          description: '',
          goal: 'lead',
          industry: null,
          scope: { kind: 'workspace' },
        },
      },
    });
    expect(
      await screen.findByText('Đã lưu template “Tư vấn niềng răng trả góp”, phiên bản 1'),
    ).toBeInTheDocument();
  });
});
