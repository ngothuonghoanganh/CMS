import { type CustomRole, endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { RolesScreen } from './RolesScreen';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const WORKSPACE_ID = '64b0000000000000000000a1';
const counts = { owner: 1, admin: 1, editor: 2, contributor: 1, support: 1, viewer: 0 };

const contentLead: CustomRole = {
  id: '64b0000000000000000000d1',
  name: 'Trưởng nhóm nội dung',
  basedOn: 'editor',
  permissions: ['pages.edit', 'pages.requestPublish', 'leads.view'],
  wholeWorkspace: false,
  memberCount: 2,
  invitationCount: 0,
  createdAt: '2026-11-01T03:00:00.000Z',
  updatedAt: '2026-11-01T03:00:00.000Z',
};

function renderRoles(customRoles: CustomRole[] = []) {
  return renderWithProviders(
    <RolesScreen
      workspaceId={WORKSPACE_ID}
      workspaceName="Mây Xanh Agency"
      counts={counts}
      initialCustomRoles={customRoles}
      loadedAt={Date.now()}
    />,
  );
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.listCustomRoles
      ? Promise.resolve({ items: [] })
      : Promise.reject(new Error('unexpected call')),
  );
});

/** The row named `label`, one letter per role: y when the role may, r when it asks, n otherwise. */
function rowOf(label: string): string {
  const header = screen.getByRole('rowheader', { name: label });
  const row = header.closest('tr');
  if (row === null) {
    throw new Error(`no row for ${label}`);
  }
  return within(row)
    .getAllByRole('cell')
    .map((cell) =>
      within(cell).queryByText('Được phép') !== null
        ? 'y'
        : within(cell).queryByText('Yêu cầu') !== null
          ? 'r'
          : 'n',
    )
    .join('');
}

describe('RolesScreen', () => {
  it('lists the six roles with their members, and the system roles cannot change', () => {
    renderRoles();
    const list = screen.getByRole('navigation', { name: 'Danh sách vai trò' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Chủ sở hữuHệ thống · không sửa được1 thành viên',
      'Quản trịHệ thống1 thành viên',
      'Biên tậpHệ thống2 thành viên',
      'Cộng tác viênHệ thống1 thành viên',
      'Chăm sóc khách hàngHệ thống1 thành viên',
      'Chỉ xemHệ thống0 thành viên',
    ]);
  });

  it('shows what each role may do as a table, the API’s own rules (ADR-020)', () => {
    renderRoles();
    const table = screen.getByRole('table', { name: 'Ma trận quyền theo vai trò' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['QUYỀN', 'Chủ sở hữu', 'Quản trị', 'Biên tập', 'Cộng tác viên', 'CSKH', 'Chỉ xem']);
    // A Cộng tác viên asks; Chủ sở hữu and Quản trị approve (ADR-023).
    expect(rowOf('Xuất bản, cập nhật trang live')).toBe('yyyrnn');
    expect(rowOf('Duyệt hoặc từ chối yêu cầu xuất bản')).toBe('yynnnn');
    expect(within(table).getAllByText('(phải được duyệt)')).toHaveLength(1);
    const legend = screen.getByRole('list', { name: 'Chú thích' });
    expect(legend).toHaveTextContent('Yêu cầuPhải được duyệt');
    expect(rowOf('Xem lead và nơi nhận lead')).toBe('yynnyn');
    expect(rowOf('Xuất lead ra CSV / Excel')).toBe('yynnnn');
    expect(rowOf('Xem trang, bản nháp và hiệu quả')).toBe('yyyyyy');
    expect(within(table).getAllByText('Không').length).toBeGreaterThan(0);
  });

  it('brings the chosen role forward', async () => {
    const user = userEvent.setup();
    renderRoles();
    expect(screen.getByRole('button', { name: /^Biên tập/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/Đang làm nổi Biên tập/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Chăm sóc khách hàng/ }));
    expect(screen.getByRole('button', { name: /^Chăm sóc khách hàng/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Biên tập/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText(/Đang làm nổi Chăm sóc khách hàng/)).toBeInTheDocument();
  });
});

describe('RolesScreen · custom roles (ADR-024)', () => {
  it('lists custom roles after the system ones, and opens one in the editor', async () => {
    const user = userEvent.setup();
    renderRoles([contentLead]);
    const list = screen.getByRole('navigation', { name: 'Danh sách vai trò' });
    expect(within(list).getByRole('button', { name: /^Trưởng nhóm nội dung/ })).toHaveTextContent(
      'Tùy chỉnh · từ Biên tập2 thành viên',
    );
    await user.click(within(list).getByRole('button', { name: /^Trưởng nhóm nội dung/ }));
    expect(
      screen.getByRole('heading', { name: 'Vai trò: Trưởng nhóm nội dung' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Ma trận quyền theo vai trò' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Tên vai trò' })).toHaveValue(
      'Trưởng nhóm nội dung',
    );
    const publish = screen.getByRole('group', { name: 'Xuất bản, cập nhật trang live' });
    expect(within(publish).getByRole('button', { name: 'Yêu cầu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Xem lead và nơi nhận lead' })).toBeChecked();
    expect(
      screen.getByText(
        '2 người đang giữ vai trò này, tính cả lời mời đang chờ. Quyền mới áp dụng ngay ở thao tác kế tiếp của họ.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa vai trò' })).toBeDisabled();
  });

  it('creates a role from Biên tập, marking and summing up what differs, then saves it', async () => {
    const user = userEvent.setup();
    renderRoles();
    await user.click(screen.getByRole('button', { name: 'Vai trò tùy chỉnh' }));
    expect(screen.getByRole('heading', { name: 'Vai trò mới' })).toBeInTheDocument();
    expect(screen.getByText('Giống hệt Biên tập.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Tên vai trò' }), 'Trưởng nhóm nội dung');
    await user.click(
      screen.getByRole('switch', { name: 'Rollback, hoàn tác, gỡ trang khỏi live' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Xem lead và nơi nhận lead' }));
    const summary = screen.getByRole('region', { name: 'Tóm tắt trước khi lưu' });
    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Bỏ: Rollback, hoàn tác, gỡ trang khỏi live', 'Thêm: Xem lead và nơi nhận lead']);

    const created: CustomRole = {
      ...contentLead,
      permissions: ['pages.edit', 'pages.publish', 'leads.view'],
      memberCount: 0,
    };
    // The list is read again after saving, and never answers here: the editor must open on the
    // role just saved without waiting for it.
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.createCustomRole ? Promise.resolve(created) : new Promise(() => {}),
    );
    await user.click(screen.getByRole('button', { name: 'Lưu vai trò' }));
    expect(lastCallTo(apiMock, endpoints.createCustomRole)).toEqual({
      args: [WORKSPACE_ID],
      options: {
        body: {
          name: 'Trưởng nhóm nội dung',
          basedOn: 'editor',
          permissions: ['pages.edit', 'pages.publish', 'leads.view'],
          wholeWorkspace: false,
        },
      },
    });
    expect(await screen.findByText('Đã lưu vai trò Trưởng nhóm nội dung')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Vai trò: Trưởng nhóm nội dung' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Xem lead và nơi nhận lead' })).toBeChecked();
  });

  it('asks for a name before saving', async () => {
    const user = userEvent.setup();
    renderRoles();
    await user.click(screen.getByRole('button', { name: 'Vai trò tùy chỉnh' }));
    await user.click(screen.getByRole('button', { name: 'Lưu vai trò' }));
    expect(screen.getByText('Nhập tên vai trò')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.createCustomRole,
      expect.anything(),
      expect.anything(),
    );
  });

  it('refuses a system role’s name on its field, and says what else a row switched', async () => {
    const user = userEvent.setup();
    renderRoles();
    await user.click(screen.getByRole('button', { name: 'Vai trò tùy chỉnh' }));
    await user.click(
      screen.getByRole('switch', { name: 'Sửa bản nháp, section, SEO, tải ảnh lên' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Cũng tắt: Xuất bản, cập nhật trang live, Rollback, hoàn tác, gỡ trang khỏi live.',
    );
    await user.type(screen.getByRole('textbox', { name: 'Tên vai trò' }), 'quản trị');
    await user.click(screen.getByRole('button', { name: 'Lưu vai trò' }));
    expect(screen.getByText('Tên này là tên của một vai trò hệ thống')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.createCustomRole,
      expect.anything(),
      expect.anything(),
    );
  });

  it('offers no new role once the workspace has ten', () => {
    renderRoles(
      Array.from({ length: 10 }, (_, index) => ({
        ...contentLead,
        id: `64b0000000000000000000${(index + 16).toString(16)}`,
        name: `Vai trò ${index}`,
      })),
    );
    expect(screen.getByRole('button', { name: 'Vai trò tùy chỉnh' })).toBeDisabled();
    expect(
      screen.getByText('Đã đủ 10 vai trò tùy chỉnh. Xóa một vai trò không dùng để tạo thêm.'),
    ).toBeInTheDocument();
  });
});
