import {
  type ContactProfile,
  type ContactProfileResponse,
  endpoints,
  type TimelineResponse,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import { siteFixture } from '../../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../../shell/test-utils';
import { ContactProfileScreen } from './ContactProfileScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const site = siteFixture();
// 16:50 on 1 November 2026 in Vietnam.
const LOADED_AT = Date.parse('2026-11-01T09:50:00.000Z');
const HA = { id: '64b0000000000000000000e1', name: 'Thu Hà' };
const PHUONG = { id: '64b0000000000000000000e2', name: 'Lan Phương' };
const LEAD_ID = '64b0000000000000000000b1';

function contact(overrides: Partial<ContactProfile> = {}): ContactProfile {
  return {
    id: '64b0000000000000000000c1',
    name: 'Nguyễn Thu Trang',
    phone: '+84912345678',
    email: 'trang.nt@gmail.com',
    createdAt: '2026-10-28T07:02:00.000Z',
    owner: HA,
    tags: ['Niềng răng', 'Trả góp'],
    origin: { kind: 'lead' },
    consent: {
      processing: {
        leadId: LEAD_ID,
        at: '2026-10-28T07:02:00.000Z',
        version: 3,
        page: { id: '64b0000000000000000000a1', title: 'Ưu đãi niềng răng' },
        pageVersion: 12,
      },
      marketing: { consented: false, at: null },
    },
    leadCount: 2,
    can: { handle: true, export: true, manage: true },
    ...overrides,
  };
}

function profileOf(overrides: Partial<ContactProfile> = {}): ContactProfileResponse {
  return {
    contact: contact(overrides),
    tasks: [
      {
        id: '64b0000000000000000000d1',
        title: 'Gọi xác nhận lịch hẹn',
        dueAt: '2026-11-01T09:25:00.000Z',
        assignee: HA,
        doneAt: null,
      },
      {
        id: '64b0000000000000000000d2',
        title: 'Gửi bảng giá trả góp qua Zalo',
        dueAt: '2026-11-02T03:00:00.000Z',
        assignee: HA,
        doneAt: null,
      },
      {
        id: '64b0000000000000000000d3',
        title: 'Gọi lại trong 15 phút',
        dueAt: '2026-10-28T07:17:00.000Z',
        assignee: HA,
        doneAt: '2026-10-28T07:10:00.000Z',
      },
    ],
    meetings: [
      {
        id: '64b0000000000000000000f1',
        at: '2026-11-02T02:30:00.000Z',
        place: 'Chi nhánh Quận 3',
        with: 'BS. Trần Minh',
        note: 'Khám và chụp phim 3D',
      },
    ],
    opportunities: [
      {
        id: '64b0000000000000000000f7',
        title: 'Niềng răng Invisalign',
        stage: 'scheduled',
        value: 38_000_000,
        valueBy: HA,
        won: null,
        lost: null,
        owner: HA,
        contact: { id: '64b0000000000000000000c1', name: 'Nguyễn Thu Trang' },
        next: null,
        stageChangedAt: '2026-10-31T09:20:00.000Z',
        createdAt: '2026-10-28T07:02:00.000Z',
      },
    ],
  };
}

const TIMELINE: TimelineResponse = {
  items: [
    {
      kind: 'note',
      id: '64b000000000000000000101',
      at: '2026-10-28T07:20:00.000Z',
      actor: HA,
      text: 'Quan tâm Invisalign, sợ đau.',
    },
    {
      kind: 'lead',
      id: LEAD_ID,
      at: '2026-10-28T07:02:00.000Z',
      page: { id: '64b0000000000000000000a1', title: 'Ưu đãi niềng răng tháng 11' },
      message: null,
      source: 'facebook',
      medium: 'cpc',
      campaign: 'chien-dich-thang-11',
      consentVersion: 3,
      joined: false,
    },
  ],
  nextCursor: 'next',
};

function render(profile = profileOf()) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.contactProfile) {
      return Promise.resolve(profile);
    }
    if (endpoint === endpoints.contactTimeline) {
      return Promise.resolve({ items: [], nextCursor: null });
    }
    if (endpoint === endpoints.createContactNote) {
      return Promise.resolve(TIMELINE.items[0]);
    }
    if (endpoint === endpoints.createContactTask || endpoint === endpoints.updateContactTask) {
      return Promise.resolve(profile.tasks[0]);
    }
    if (endpoint === endpoints.createContactMeeting) {
      return Promise.resolve(profile.meetings[0]);
    }
    if (endpoint === endpoints.updateContact) {
      return Promise.resolve({ ...profile.contact, owner: PHUONG });
    }
    if (endpoint === endpoints.contactDeletionPreview) {
      return Promise.resolve({
        leads: 2,
        notes: 4,
        tasks: 3,
        meetings: 1,
        requests: [
          {
            id: '64b0000000000000000000aa',
            receivedAt: '2026-10-30T03:00:00.000Z',
            completeBy: '2026-11-27T03:00:00.000Z',
          },
        ],
      });
    }
    if (endpoint === endpoints.deleteContactPerson) {
      return Promise.resolve({ deletedLeads: 2 });
    }
    return Promise.reject(new Error(`Unexpected call to ${endpoint.method}`));
  });
  return renderWithProviders(
    <ContactProfileScreen
      site={site}
      profile={profile}
      timeline={TIMELINE}
      options={{ assignees: [HA, PHUONG], tags: ['Implant', 'Niềng răng'] }}
      loadedAt={LOADED_AT}
    />,
  );
}

beforeEach(() => {
  // "Quá hạn" and the default due time count from the clock.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(LOADED_AT);
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.mockReset();
  router.push.mockReset();
});

describe('ContactProfileScreen (board 23)', () => {
  it('shows who the person is, how to reach them, and what they agreed to', () => {
    render();
    expect(screen.getByRole('heading', { level: 1, name: 'Nguyễn Thu Trang' })).toBeInTheDocument();
    expect(screen.getByText('0912 345 678')).toBeInTheDocument();
    expect(screen.getByText('Khách từ 28/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi' })).toHaveAttribute('href', 'tel:+84912345678');
    expect(screen.getByRole('link', { name: 'Nhắn Zalo' })).toHaveAttribute(
      'href',
      'https://zalo.me/0912345678',
    );
    const consent = screen.getByRole('region', { name: 'Đồng ý' });
    expect(
      within(consent).getByText(
        'Xử lý dữ liệu để tư vấn · 28/10 14:02 · nội dung đồng ý v3 · trang “Ưu đãi niềng răng” bản v12',
      ),
    ).toBeInTheDocument();
    expect(
      within(consent).getByText('Không đồng ý nhận ưu đãi. Không đưa vào chiến dịch quảng cáo.'),
    ).toBeInTheDocument();
    expect(
      within(consent).getByRole('link', { name: 'Xem bằng chứng trong lead' }),
    ).toHaveAttribute('href', expect.stringContaining(`lead=${LEAD_ID}`));
  });

  it('lists the opportunities with their stage, value and who entered it', () => {
    render();
    const card = screen.getByRole('region', { name: 'Cơ hội' });
    expect(within(card).getByText('Niềng răng Invisalign')).toBeInTheDocument();
    expect(within(card).getByText('Hẹn lịch')).toBeInTheDocument();
    expect(within(card).getByText('38.000.000 ₫')).toBeInTheDocument();
    expect(within(card).getByText('Giá trị dự kiến do Thu Hà nhập')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Pipeline' })).toHaveAttribute(
      'href',
      `/sites/${site.id}/contacts/pipeline`,
    );
  });

  it('lists tasks with what is overdue, upcoming meetings, and the timeline', () => {
    render();
    const tasks = screen.getByRole('region', { name: 'Công việc' });
    expect(within(tasks).getByText('Quá hạn 25 phút · Thu Hà')).toBeInTheDocument();
    expect(within(tasks).getByText('Mai 10:00 · Thu Hà')).toBeInTheDocument();
    expect(within(tasks).getByRole('checkbox', { name: 'Gọi lại trong 15 phút' })).toBeChecked();
    const meetings = screen.getByRole('region', { name: 'Lịch hẹn sắp tới' });
    expect(within(meetings).getByText('T2 02/11 · 09:30')).toBeInTheDocument();
    expect(
      within(meetings).getByText('Khám và chụp phim 3D · Chi nhánh Quận 3 · BS. Trần Minh'),
    ).toBeInTheDocument();
    const timeline = screen.getByRole('region', { name: 'Dòng thời gian' });
    expect(
      within(timeline).getByText('Lead mới từ “Ưu đãi niềng răng tháng 11”'),
    ).toBeInTheDocument();
    expect(
      within(timeline).getByText('Đồng ý xử lý dữ liệu v3 · facebook / cpc / chien-dich-thang-11'),
    ).toBeInTheDocument();
    expect(within(timeline).getByText('28/10 · 14:20 · Thu Hà')).toBeInTheDocument();
    expect(within(timeline).getByRole('button', { name: 'Xem thêm' })).toBeInTheDocument();
  });

  it('saves a note, adds a task and books a meeting from the composer', async () => {
    const user = userEvent.setup();
    render();
    const composer = screen.getByRole('tablist', { name: 'Thêm vào hồ sơ' });
    await user.type(screen.getByRole('textbox', { name: 'Ghi chú' }), 'Hẹn gọi lại');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    expect(lastCallTo(apiMock, endpoints.createContactNote).options).toEqual({
      body: { text: 'Hẹn gọi lại' },
    });

    await user.click(within(composer).getByRole('tab', { name: 'Công việc' }));
    await user.type(screen.getByRole('textbox', { name: 'Việc cần làm' }), 'Gọi xác nhận');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Giao cho' }), PHUONG.id);
    await user.click(screen.getByRole('button', { name: 'Thêm công việc' }));
    expect(lastCallTo(apiMock, endpoints.createContactTask).options).toEqual({
      // The next whole hour at least 30 minutes ahead: 18:00 in Vietnam.
      body: { title: 'Gọi xác nhận', dueAt: '2026-11-01T11:00:00.000Z', assigneeId: PHUONG.id },
    });

    await user.click(within(composer).getByRole('tab', { name: 'Lịch hẹn' }));
    await user.click(screen.getByRole('button', { name: 'Đặt lịch hẹn' }));
    expect(screen.getByText('Chọn ngày giờ')).toBeInTheDocument();
    expect(screen.getByText('Nhập nơi hẹn')).toBeInTheDocument();
  });

  it('moves between the composer tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('tab', { name: 'Ghi chú' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Công việc' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Công việc' })).toHaveAttribute('aria-selected', 'true');
  });

  it('gives the profile to someone else and ticks a task done', async () => {
    const user = userEvent.setup();
    render();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Người phụ trách' }), PHUONG.id);
    expect(lastCallTo(apiMock, endpoints.updateContact).options).toEqual({
      body: { action: 'assign', ownerId: PHUONG.id },
    });
    await user.click(screen.getByRole('checkbox', { name: /Gọi xác nhận lịch hẹn/ }));
    expect(lastCallTo(apiMock, endpoints.updateContactTask)).toMatchObject({
      args: [site.id, '64b0000000000000000000c1', '64b0000000000000000000d1'],
      options: { body: { done: true } },
    });
  });

  it('says why the data actions are missing for a role without them', async () => {
    const user = userEvent.setup();
    render(profileOf({ can: { handle: true, export: false, manage: false } }));
    await user.click(screen.getByRole('button', { name: 'Thao tác dữ liệu' }));
    const exportItem = await screen.findByRole('menuitem', { name: /Xuất dữ liệu của người này/ });
    expect(exportItem).toHaveAttribute('aria-disabled', 'true');
    expect(exportItem).toHaveTextContent('Cần quyền “Xuất lead ra CSV / Excel”.');
    expect(screen.getByRole('menuitem', { name: /Xóa dữ liệu của người này/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('counts what a deletion removes, completes the request picked, and goes back to the list', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Thao tác dữ liệu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa dữ liệu của người này' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Xóa toàn bộ dữ liệu của Nguyễn Thu Trang?',
    });
    expect(
      await within(dialog).findByText(
        '2 lead và bằng chứng đồng ý, 4 ghi chú, 3 công việc, 1 lịch hẹn.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Gắn với yêu cầu dữ liệu' })).toHaveValue(
      '64b0000000000000000000aa',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Xóa dữ liệu' }));
    expect(lastCallTo(apiMock, endpoints.deleteContactPerson).options).toEqual({
      body: { requestId: '64b0000000000000000000aa' },
    });
    expect(router.push).toHaveBeenCalledWith(`/sites/${site.id}/contacts`);
  });

  it('writes nothing for a role that only views', () => {
    render(profileOf({ can: { handle: false, export: false, manage: false } }));
    expect(screen.queryByRole('tablist', { name: 'Thêm vào hồ sơ' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Người phụ trách' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '+ Nhãn' })).not.toBeInTheDocument();
  });
});
