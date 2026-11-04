import {
  type Access,
  type ContactListItem,
  type ContactListResponse,
  endpoints,
  type MergeSuggestion,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { ContactsScreen } from './ContactsScreen';
import { defaultPicks } from './MergeSuggestionPanel';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const site = siteFixture();
// 16:50 on 4 November 2026 in Vietnam.
const LOADED_AT = Date.parse('2026-11-04T09:50:00.000Z');
const HA = { id: '64b0000000000000000000e1', name: 'Thu Hà' };

function contact(overrides: Partial<ContactListItem> = {}): ContactListItem {
  return {
    id: '64b0000000000000000000c1',
    name: 'Nguyễn Thu Trang',
    phone: '+84912345678',
    email: null,
    source: {
      kind: 'lead',
      page: { id: '64b0000000000000000000a1', title: 'Ưu đãi niềng răng tháng 11' },
      source: { source: 'facebook', medium: 'cpc' },
    },
    leadCount: 2,
    owner: HA,
    tags: ['Niềng răng', 'Trả góp'],
    possibleDuplicate: false,
    lastActivityAt: '2026-11-04T07:50:00.000Z',
    ...overrides,
  };
}

const trang = contact();
const huong = contact({
  id: '64b0000000000000000000c2',
  name: 'Bùi Thanh Hương',
  phone: '+84915007266',
  source: { kind: 'manual', channel: 'phone_call' },
  leadCount: 0,
  owner: null,
  tags: [],
  possibleDuplicate: true,
  lastActivityAt: '2026-10-28T03:00:00.000Z',
});

function listOf(items: ContactListItem[], nextCursor: string | null = null): ContactListResponse {
  const count = (value: number) => ({ count: value, capped: false });
  return {
    items,
    nextCursor,
    counts: { all: count(312), mine: count(48), unassigned: count(17), duplicates: count(4) },
  };
}

const pair: MergeSuggestion = {
  id: '64b0000000000000000000f1',
  reason: {
    kind: 'name_page',
    page: { id: '64b0000000000000000000a1', title: 'Niềng răng' },
    days: 2,
  },
  a: {
    id: trang.id,
    name: 'Nguyễn Thu Trang',
    phone: '+84912345678',
    email: null,
    owner: HA,
    marketingAt: null,
    leadCount: 2,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  b: {
    id: huong.id,
    name: 'Thu Trang',
    phone: null,
    email: 'trang.nt@gmail.com',
    owner: null,
    marketingAt: '2026-10-30T02:00:00.000Z',
    leadCount: 1,
    createdAt: '2026-10-30T02:00:00.000Z',
  },
};

function render(role: Access = 'owner', list = listOf([trang, huong])) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.listContacts || endpoint === endpoints.searchContacts) {
      return Promise.resolve(list);
    }
    if (endpoint === endpoints.listMergeSuggestions) {
      return Promise.resolve({ items: [pair], total: { count: 4, capped: false } });
    }
    if (endpoint === endpoints.bulkUpdateContacts) {
      return Promise.resolve({ updated: 2 });
    }
    if (endpoint === endpoints.createContact) {
      return Promise.resolve({ status: 'exists', contact: { id: trang.id, name: trang.name } });
    }
    if (endpoint === endpoints.mergeContacts) {
      return Promise.resolve({ contact: trang });
    }
    return Promise.reject(new Error(`Unexpected call to ${endpoint.method}`));
  });
  return renderWithProviders(
    <ContactsScreen
      site={site}
      role={role}
      initialList={list}
      initialOptions={{ assignees: [HA], tags: ['Implant', 'Niềng răng'] }}
      loadedAt={LOADED_AT}
    />,
  );
}

afterEach(() => {
  apiMock.mockReset();
});

describe('ContactsScreen (board 22)', () => {
  it('shows each view with its count, and a row per profile as the board does', () => {
    render();
    const views = screen.getByRole('group', { name: 'Danh sách' });
    expect(
      within(views)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Tất cả · 312', 'Của tôi · 48', 'Chưa giao · 17', 'Có thể trùng · 4']);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0] as HTMLElement).getByText('0912 345 678')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('facebook / cpc · 2 lead')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByRole('time')).toHaveAttribute(
      'datetime',
      trang.lastActivityAt,
    );
    expect(
      within(rows[1] as HTMLElement).getByText('Thêm tay · khách gọi điện'),
    ).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Chưa giao')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('CÓ THỂ TRÙNG')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1–2 trên 312')).toBeInTheDocument();
  });

  it('searches from the request body and narrows to a tag', async () => {
    const user = userEvent.setup();
    render();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Nhãn' }), 'Implant');
    await user.type(screen.getByRole('searchbox', { name: 'Tìm khách hàng' }), '0912');
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.searchContacts).options).toMatchObject({
        body: { view: 'all', tag: 'Implant', q: '0912' },
      });
    });
  });

  it('assigns the selected profiles from the bulk bar', async () => {
    const user = userEvent.setup();
    render();
    expect(screen.queryByRole('toolbar', { name: 'Thao tác hàng loạt' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả' }));
    const bar = screen.getByRole('toolbar', { name: 'Thao tác hàng loạt' });
    expect(within(bar).getByText('2 khách đã chọn')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Giao cho…' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Thu Hà' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.bulkUpdateContacts).options).toEqual({
        body: { action: 'assign', contactIds: [trang.id, huong.id], ownerId: HA.id },
      });
    });
  });

  it('offers no changes to a role that only views', () => {
    render({ customRoleId: '64b0000000000000000000d9', name: 'Xem', permissions: ['leads.view'] });
    expect(screen.queryByRole('button', { name: 'Thêm khách hàng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Chọn tất cả' })).not.toBeInTheDocument();
  });

  it('points to the profile that already has the number', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Thêm khách hàng' }));
    const dialog = screen.getByRole('dialog', { name: 'Thêm khách hàng' });
    await user.type(within(dialog).getByRole('textbox', { name: /Họ và tên/ }), 'Trang');
    await user.type(within(dialog).getByRole('textbox', { name: /Số điện thoại/ }), '0912345678');
    await user.click(within(dialog).getByRole('button', { name: 'Thêm khách hàng' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Số này đã thuộc hồ sơ Nguyễn Thu Trang.',
    );
    expect(lastCallTo(apiMock, endpoints.createContact).options).toEqual({
      body: { name: 'Trang', phone: '0912345678', channel: 'phone_call', marketing: false },
    });
  });

  it('compares a pair field by field and merges with the sides picked', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Có thể trùng · 4' }));
    const panel = await screen.findByRole('region', { name: 'Cặp 1/4 · có thể là cùng một người' });
    expect(
      within(panel).getByText('Lý do: tên giống nhau, cùng đăng ký trang Niềng răng trong 2 ngày'),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('radio', { name: 'trang.nt@gmail.com' })).toBeChecked();
    await user.click(within(panel).getByRole('radio', { name: 'Thu Trang' }));
    await user.click(within(panel).getByRole('button', { name: 'Gộp hai hồ sơ' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.mergeContacts)).toEqual({
        args: [site.id, pair.id],
        options: {
          body: { picks: { name: 'b', phone: 'a', email: 'b', owner: 'a', marketing: 'b' } },
        },
      });
    });
  });

  it('picks the kept profile’s value unless only the other one has it', () => {
    expect(defaultPicks(pair)).toEqual({
      name: 'a',
      phone: 'a',
      email: 'b',
      owner: 'a',
      marketing: 'b',
    });
  });

  it('explains an empty list and where profiles come from', () => {
    const none = { count: 0, capped: false };
    render('owner', {
      items: [],
      nextCursor: null,
      counts: { all: none, mine: none, unassigned: none, duplicates: none },
    });
    expect(screen.getByRole('heading', { name: 'Chưa có khách hàng nào' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thêm form vào một trang' })).toHaveAttribute(
      'href',
      `/sites/${site.id}`,
    );
  });
});
