import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../shell/test-utils';
import { RolesScreen } from './RolesScreen';

const counts = { owner: 1, admin: 1, editor: 2, contributor: 1, support: 1, viewer: 0 };

function renderRoles() {
  return renderWithProviders(<RolesScreen workspaceName="Mây Xanh Agency" counts={counts} />);
}

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
        .getAllByRole('button')
        .map((button) => button.textContent),
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
