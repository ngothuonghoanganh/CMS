import {
  type AccessRequest,
  endpoints,
  type Invitation,
  type Member,
  type MemberListResponse,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { MembersScreen, type MembersScreenProps } from './MembersScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => `/workspaces/64b0000000000000000000a1/members`,
}));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const LOADED_AT = Date.parse('2026-11-01T03:00:00.000Z');

beforeAll(() => {
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture']) {
    if (!Reflect.has(Element.prototype, method)) {
      Object.defineProperty(Element.prototype, method, {
        configurable: true,
        value: method === 'hasPointerCapture' ? () => false : () => undefined,
      });
    }
  }
});

const smile = siteFixture();
const kitchen = siteFixture({ id: '64b000000000000000000002', name: 'Bếp Nhà Mây' });

function member(overrides: Partial<Member>): Member {
  return {
    userId: '64b0000000000000000000c1',
    name: 'Ngọc Anh',
    email: 'ngocanh@mayxanh.vn',
    role: 'owner',
    siteIds: null,
    joinedAt: '2026-10-01T03:00:00.000Z',
    ...overrides,
  };
}

const owner = member({});
const admin = member({
  userId: '64b0000000000000000000c2',
  name: 'Quốc Bảo',
  email: 'bao@mayxanh.vn',
  role: 'admin',
});
const editor = member({
  userId: '64b0000000000000000000c3',
  name: 'Minh Khoa',
  email: 'khoa@mayxanh.vn',
  role: 'editor',
  siteIds: [smile.id, kitchen.id],
});
const viewer = member({
  userId: '64b0000000000000000000c4',
  name: 'Đức Trí',
  email: 'tri@smilecare.vn',
  role: 'viewer',
  siteIds: [smile.id],
});
const members: MemberListResponse = { items: [owner, admin, editor, viewer] };

const invitation: Invitation = {
  id: '64b0000000000000000000d1',
  email: 'an.tran@bepnhamay.vn',
  role: 'viewer',
  siteIds: [kitchen.id],
  invitedBy: { id: owner.userId, name: owner.name },
  createdAt: '2026-10-30T03:00:00.000Z',
  expiresAt: '2026-11-06T03:00:00.000Z',
  sentAt: '2026-10-30T03:00:01.000Z',
};

const request: AccessRequest = {
  id: '64b0000000000000000000e1',
  user: { id: viewer.userId, name: viewer.name, email: viewer.email },
  current: { role: 'viewer', siteIds: [smile.id] },
  role: 'editor',
  wholeWorkspace: false,
  note: 'Cần sửa trang ưu đãi',
  createdAt: '2026-10-31T03:00:00.000Z',
};

function renderScreen(overrides: Partial<MembersScreenProps> = {}) {
  return renderWithProviders(
    <MembersScreen
      workspace={{ id: WORKSPACE_ID, name: 'Mây Xanh Agency' }}
      viewer={{ userId: owner.userId, role: 'owner' }}
      sites={[smile, kitchen]}
      initialCustomRoles={[]}
      initialMembers={members}
      initialInvitations={{ items: [invitation] }}
      initialRequests={{ items: [request] }}
      openRequestId={null}
      loadedAt={LOADED_AT}
      {...overrides}
    />,
  );
}

const accepted = { ...viewer, role: 'editor', siteIds: [smile.id, kitchen.id] };

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.acceptAccessRequest) {
      return Promise.resolve(accepted);
    }
    if (endpoint === endpoints.listMembers) {
      return Promise.resolve(members);
    }
    if (endpoint === endpoints.listInvitations) {
      return Promise.resolve({ items: [invitation] });
    }
    if (endpoint === endpoints.listAccessRequests) {
      return Promise.resolve({ items: [request] });
    }
    return Promise.reject(new Error('unexpected call'));
  });
});

describe('MembersScreen', () => {
  it('lists the members with their role, sites and what Chủ sở hữu may do', () => {
    renderScreen();
    expect(screen.getByText('Đang dùng 5/100 chỗ')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    const own = rows[0];
    if (own === undefined) {
      throw new Error('missing row');
    }
    expect(within(own).getByRole('rowheader')).toHaveTextContent('Ngọc Anh (bạn)');
    expect(within(own).getByRole('button', { name: 'Chuyển quyền sở hữu' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Minh Khoa/ })).toHaveTextContent(
      'Nha khoa Smile Care, Bếp Nhà Mây',
    );
    expect(screen.getByRole('button', { name: 'Đổi quyền của Minh Khoa' })).toBeInTheDocument();
  });

  it('starts "Đổi quyền" from the member as they are, whatever was left last time', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Đổi quyền của Minh Khoa' }));
    let dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Vai trò'), 'viewer');
    expect(within(dialog).getByLabelText('Vai trò')).toHaveValue('viewer');
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));

    await user.click(screen.getByRole('button', { name: 'Đổi quyền của Minh Khoa' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Vai trò')).toHaveValue('editor');
  });

  it('keeps "Đổi quyền" open while saving, so its answer is seen', async () => {
    const user = userEvent.setup();
    const served = apiMock.getMockImplementation();
    let refuse: (error: unknown) => void = () => undefined;
    apiMock.mockImplementation((endpoint, ...rest) =>
      endpoint === endpoints.updateMember
        ? new Promise((_, reject) => {
            refuse = reject;
          })
        : (served?.(endpoint, ...rest) ?? Promise.reject(new Error('unexpected call'))),
    );
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Đổi quyền của Minh Khoa' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Vai trò'), 'viewer');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu quyền' }));
    await user.keyboard('{Escape}');
    refuse(apiError(422, 'validation_failed', 'Vai trò này không còn trong workspace'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Vai trò này không còn trong workspace',
    );
  });

  it('asks for a role, never shows another, when the member’s role is not in the list', async () => {
    const user = userEvent.setup();
    const holder = member({
      userId: '64b0000000000000000000c9',
      name: 'Bảo Ngọc',
      email: 'bao.ngoc@mayxanh.vn',
      role: { customRoleId: '64b0000000000000000000d9', name: 'Vai trò đã xóa', permissions: [] },
      siteIds: [smile.id],
    });
    const withHolder = { items: [...members.items, holder] };
    apiMock.mockImplementation((endpoint) =>
      Promise.resolve(endpoint === endpoints.listMembers ? withHolder : { items: [] }),
    );
    renderScreen({ initialMembers: withHolder });
    await user.click(screen.getByRole('button', { name: 'Đổi quyền của Bảo Ngọc' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Vai trò')).toHaveValue('');
    expect(dialog).toHaveTextContent(
      'Vai trò đã xóa không còn trong danh sách vai trò. Chọn một vai trò để lưu.',
    );
    expect(within(dialog).getByRole('button', { name: 'Lưu quyền' })).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Vai trò'), 'viewer');
    expect(within(dialog).getByRole('button', { name: 'Lưu quyền' })).toBeEnabled();
  });

  it('filters by role, site and name', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.selectOptions(screen.getByLabelText('Lọc theo vai trò'), 'editor');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Lọc theo vai trò'), 'all');
    await user.selectOptions(screen.getByLabelText('Lọc theo site'), kitchen.id);
    // The whole-workspace members and Minh Khoa work on Bếp Nhà Mây; Đức Trí does not.
    expect(screen.queryByRole('row', { name: /Đức Trí/ })).toBeNull();
    await user.type(screen.getByLabelText('Tìm thành viên'), 'bao@');
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining('Quốc Bảo')]);
  });

  it('opens the request of the email, and accepts it with the sites decided', async () => {
    const user = userEvent.setup();
    renderScreen({ openRequestId: request.id });
    const dialog = await screen.findByRole('dialog', { name: 'Quyền của Đức Trí' });
    expect(dialog).toHaveTextContent('Đức Trí đang là Chỉ xem và xin làm Biên tập');
    expect(within(dialog).getByLabelText('Vai trò')).toHaveValue('editor');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Bếp Nhà Mây' }));
    expect(within(dialog).getByText('Sẽ thêm')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Chấp nhận và lưu quyền' }));
    expect(lastCallTo(apiMock, endpoints.acceptAccessRequest)).toEqual({
      args: [WORKSPACE_ID, request.id],
      options: { body: { role: 'editor', siteIds: [smile.id, kitchen.id] } },
    });
  });

  it('invites emails with one role on the sites chosen', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Mời thành viên' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mời thành viên' });
    await user.type(within(dialog).getByLabelText('Email'), 'Thuy@smilecare.vn, khong-hop-le');
    await user.click(within(dialog).getByRole('button', { name: 'Gửi 2 lời mời' }));
    expect(within(dialog).getByText('Email không hợp lệ: khong-hop-le')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Email'));
    await user.type(within(dialog).getByLabelText('Email'), 'thuy@smilecare.vn');
    await user.click(within(dialog).getByRole('radio', { name: /Chăm sóc khách hàng/ }));
    expect(dialog).toHaveTextContent('Chăm sóc khách hàng được');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Nha khoa Smile Care' }));
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.createInvitations
        ? Promise.resolve({ results: [{ email: 'thuy@smilecare.vn', outcome: 'sent' }] })
        : Promise.resolve(endpoint === endpoints.listMembers ? members : { items: [] }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Gửi 1 lời mời' }));
    expect(lastCallTo(apiMock, endpoints.createInvitations)).toEqual({
      args: [WORKSPACE_ID],
      options: { body: { emails: ['thuy@smilecare.vn'], role: 'support', siteIds: [smile.id] } },
    });
    expect(await screen.findByText('Đã gửi 1 lời mời')).toBeInTheDocument();
  });

  it('invites with a custom role, given on every site when set to it (ADR-024)', async () => {
    const user = userEvent.setup();
    const everywhere = {
      id: '64b0000000000000000000d2',
      name: 'Biên tập toàn bộ',
      basedOn: 'editor' as const,
      permissions: ['pages.edit' as const, 'pages.publish' as const],
      wholeWorkspace: true,
      memberCount: 0,
      invitationCount: 0,
      createdAt: '2026-11-01T03:00:00.000Z',
      updatedAt: '2026-11-01T03:00:00.000Z',
    };
    renderScreen({ initialCustomRoles: [everywhere] });
    await user.click(screen.getByRole('button', { name: 'Mời thành viên' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mời thành viên' });
    await user.type(within(dialog).getByLabelText('Email'), 'thuy@smilecare.vn');
    await user.click(within(dialog).getByRole('radio', { name: /Biên tập toàn bộ/ }));
    expect(dialog).toHaveTextContent('Biên tập toàn bộ làm việc trên mọi site của workspace.');
    expect(within(dialog).queryByRole('checkbox', { name: 'Nha khoa Smile Care' })).toBeNull();
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.createInvitations
        ? Promise.resolve({ results: [{ email: 'thuy@smilecare.vn', outcome: 'sent' }] })
        : Promise.resolve(endpoint === endpoints.listMembers ? members : { items: [] }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Gửi 1 lời mời' }));
    expect(lastCallTo(apiMock, endpoints.createInvitations)).toEqual({
      args: [WORKSPACE_ID],
      options: {
        body: {
          emails: ['thuy@smilecare.vn'],
          role: `custom:${everywhere.id}`,
          siteIds: null,
        },
      },
    });
  });

  it('does not invite with a custom role deleted while the dialog was open', async () => {
    const user = userEvent.setup();
    const role = {
      id: '64b0000000000000000000d3',
      name: 'Trưởng nhóm',
      basedOn: 'editor' as const,
      permissions: ['pages.edit' as const],
      wholeWorkspace: false,
      memberCount: 0,
      invitationCount: 0,
      createdAt: '2026-11-01T03:00:00.000Z',
      updatedAt: '2026-11-01T03:00:00.000Z',
    };
    let roles = { items: [role] };
    apiMock.mockImplementation((endpoint) =>
      Promise.resolve(
        endpoint === endpoints.listMembers
          ? members
          : endpoint === endpoints.listCustomRoles
            ? roles
            : { items: [] },
      ),
    );
    const { queryClient } = renderScreen({ initialCustomRoles: [role] });
    await user.click(screen.getByRole('button', { name: 'Mời thành viên' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mời thành viên' });
    await user.click(within(dialog).getByRole('radio', { name: /Trưởng nhóm/ }));
    // Deleted in another tab; the list is read again.
    roles = { items: [] };
    await queryClient.invalidateQueries();
    expect(
      await within(dialog).findByText(
        'Vai trò đã chọn không còn trong workspace. Chọn một vai trò khác.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Gửi \d+ lời mời$/ })).toBeDisabled();
  });

  it('shows the invitations with how long they still work, and no requests to a Quản trị', async () => {
    const user = userEvent.setup();
    renderScreen({ viewer: { userId: admin.userId, role: 'admin' }, initialRequests: null });
    expect(screen.queryByRole('button', { name: /Yêu cầu đổi quyền/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chuyển quyền sở hữu' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Lời mời đang chờ · 1/ }));
    const row = screen.getByRole('row', { name: /an.tran@bepnhamay.vn/ });
    expect(row).toHaveTextContent('Hết hạn sau 5 ngày');
    expect(row).toHaveTextContent('Bếp Nhà Mây');
    expect(
      within(row).getByRole('button', { name: 'Thu hồi lời mời tới an.tran@bepnhamay.vn' }),
    ).toBeInTheDocument();
  });

  it('never offers a Quản trị to change or remove themselves (ADR-021)', () => {
    renderScreen({ viewer: { userId: admin.userId, role: 'admin' }, initialRequests: null });
    expect(screen.getByRole('row', { name: /Quốc Bảo \(bạn\)/ })).not.toHaveTextContent(
      'Đổi quyền',
    );
    expect(screen.getByRole('button', { name: 'Đổi quyền của Minh Khoa' })).toBeInTheDocument();
  });

  it('opens the next "Thu hồi" without the error of the last one, and reloads the list', async () => {
    const user = userEvent.setup();
    const other = { ...invitation, id: '64b0000000000000000000d2', email: 'binh@bepnhamay.vn' };
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.revokeInvitation
        ? Promise.reject(apiError(409, 'invitation_unavailable', 'Lời mời không còn hiệu lực'))
        : endpoint === endpoints.listInvitations
          ? Promise.resolve({ items: [invitation, other] })
          : Promise.reject(new Error('unexpected call')),
    );
    renderScreen({ initialInvitations: { items: [invitation, other] } });
    await user.click(screen.getByRole('button', { name: /Lời mời đang chờ · 2/ }));
    await user.click(
      screen.getByRole('button', { name: 'Thu hồi lời mời tới an.tran@bepnhamay.vn' }),
    );
    await user.click(screen.getByRole('button', { name: 'Thu hồi' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lời mời không còn hiệu lực');
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listInvitations).args).toEqual([WORKSPACE_ID]);
    });
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    await user.click(screen.getByRole('button', { name: 'Thu hồi lời mời tới binh@bepnhamay.vn' }));
    const dialog = await screen.findByRole('alertdialog', { name: /binh@bepnhamay.vn/ });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });
});
