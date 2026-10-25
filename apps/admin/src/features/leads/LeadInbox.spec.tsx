import {
  endpoints,
  type LeadCounts,
  type LeadDetail,
  type LeadListResponse,
  updateLeadRequestSchema,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, downloadFile } from '../../lib/api';
import { NO_LEADS, siteFixture } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { DEFAULT_LEAD_FILTERS, type LeadInboxFilters } from './filters';
import { LeadInbox } from './LeadInbox';
import { leadQueryKeys } from './queries';
import {
  LEAD_ID,
  leadDetail,
  leadItem,
  leadList,
  OTHER_LEAD_ID,
  PAGE_ID,
  pageRefs,
  SITE_ID,
} from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
  downloadFile: vi.fn(),
}));

const apiMock = vi.mocked(api);
const downloadMock = vi.mocked(downloadFile);
const INBOX_PATH = `/sites/${SITE_ID}/leads`;
// 16:50 on 24 October 2026 in Vietnam.
const LOADED_AT = Date.parse('2026-10-24T09:50:00.000Z');

const ha = leadItem();
const bao = leadItem({
  id: OTHER_LEAD_ID,
  name: 'Trần Quốc Bảo',
  phone: '+84938512840',
  source: { source: '(direct)', medium: '(none)', campaign: null },
  status: 'scheduled',
  createdAt: '2026-10-23T03:10:00.000Z',
});
const baoDetail = leadDetail({
  id: OTHER_LEAD_ID,
  name: 'Trần Quốc Bảo',
  phone: '+84938512840',
  email: null,
  message: null,
  status: 'scheduled',
  personLeads: { count: 1, capped: false },
});

interface Setup {
  recipientsOpen?: boolean;
  list?: LeadListResponse;
  filters?: LeadInboxFilters;
  canManage?: boolean;
  leadId?: string | null;
  /** The details the API knows; a lead missing here answers 404. */
  details?: LeadDetail[];
  /** The detail the server rendered the page with. */
  initialDetail?: LeadDetail | null;
  counts?: LeadCounts;
}

/** The first path argument of a call, e.g. the lead id of `getLead`. */
function idArgument(args: unknown): string | undefined {
  return Array.isArray(args) && typeof args[0] === 'string' ? args[0] : undefined;
}

/**
 * A small fake of the lead API: a PATCH changes the stored detail like the server does, the list
 * and the search answer `list`, and a deleted person's lead is gone.
 */
function serve(details: LeadDetail[], list: LeadListResponse) {
  const byId = new Map(details.map((detail) => [detail.id, detail]));
  apiMock.mockImplementation((endpoint, args, options) => {
    const id = idArgument(args);
    if (endpoint === endpoints.getLead || endpoint === endpoints.updateLead) {
      const current = id === undefined ? undefined : byId.get(id);
      if (current === undefined) {
        return Promise.reject(apiError(404, 'not_found', 'Không tìm thấy lead'));
      }
      if (endpoint === endpoints.getLead) {
        return Promise.resolve(current);
      }
      const changes = updateLeadRequestSchema.parse(options?.body);
      const updated: LeadDetail = {
        ...current,
        ...(changes.status === undefined ? {} : { status: changes.status }),
        ...(changes.note === undefined ? {} : { note: changes.note }),
        ...(changes.spam === undefined
          ? {}
          : { spam: { ...current.spam, suspected: changes.spam } }),
      };
      byId.set(current.id, updated);
      return Promise.resolve(updated);
    }
    if (endpoint === endpoints.deleteLeadPerson) {
      if (id !== undefined) {
        byId.delete(id);
      }
      return Promise.resolve({ deletedCount: 2 });
    }
    if (endpoint === endpoints.retryLeadNotification) {
      const current = id === undefined ? undefined : byId.get(id);
      if (current === undefined) {
        return Promise.reject(apiError(404, 'not_found', 'Không tìm thấy lead'));
      }
      const retried: LeadDetail = {
        ...current,
        notification: {
          status: 'pending',
          attempts: 0,
          lastErrorCode: null,
          sentAt: null,
          recipients: null,
          rejectedRecipients: null,
        },
      };
      byId.set(current.id, retried);
      return Promise.resolve(retried);
    }
    if (endpoint === endpoints.listLeads || endpoint === endpoints.searchLeads) {
      return Promise.resolve(list);
    }
    if (endpoint === endpoints.listLeadRecipients) {
      return Promise.resolve({ items: [] });
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

function renderInbox({
  list = leadList([ha, bao], {
    counts: { inbox: { count: 2, capped: false }, spam: { count: 1, capped: false } },
  }),
  filters = DEFAULT_LEAD_FILTERS,
  canManage = true,
  leadId = null,
  details = [leadDetail(), baoDetail],
  initialDetail = null,
  counts = NO_LEADS,
  recipientsOpen = false,
}: Setup = {}) {
  serve(details, list);
  return renderWithProviders(
    <LeadInbox
      site={siteFixture()}
      canManage={canManage}
      initialFilters={filters}
      initialLeadId={leadId}
      initialList={list}
      initialDetail={initialDetail}
      pageRefs={pageRefs}
      leadCounts={counts}
      initialRecipientsOpen={recipientsOpen}
      loadedAt={LOADED_AT}
    />,
  );
}

function row(name: string): HTMLElement {
  const cell = screen.getByRole('link', { name });
  const element = cell.closest('tr');
  if (element === null) {
    throw new Error(`no row for ${name}`);
  }
  return element;
}

async function openLead(name = 'Nguyễn Thu Hà') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name }));
  const panel = await screen.findByRole('complementary', { name });
  return { user, panel };
}

function updateCalls(): number {
  return apiMock.mock.calls.filter(([endpoint]) => endpoint === endpoints.updateLead).length;
}

beforeEach(() => {
  // Times in the list are relative to the browser's clock once the page hydrates.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(LOADED_AT);
  apiMock.mockReset();
  downloadMock.mockReset();
  window.history.replaceState(null, '', INBOX_PATH);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LeadInbox', () => {
  it('shows the leads the server loaded with the folder counts of board 10', () => {
    renderInbox();

    expect(screen.getByRole('heading', { level: 1, name: 'Leads' })).toBeInTheDocument();
    expect(
      screen.getByText('Mọi đăng ký từ form trên các trang của Nha khoa Smile Care.'),
    ).toBeInTheDocument();
    const folders = screen.getByRole('group', { name: 'Thư mục' });
    expect(within(folders).getByRole('button', { name: 'Hộp thư · 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(folders).getByRole('button', { name: 'Nghi ngờ spam · 1' })).toBeInTheDocument();

    const first = row('Nguyễn Thu Hà');
    expect(within(first).getByText('Ưu đãi niềng răng tháng 11')).toBeInTheDocument();
    expect(within(first).getByText('0901 234 567')).toBeInTheDocument();
    expect(within(first).getByText('facebook / cpc')).toBeInTheDocument();
    expect(within(first).getByText('16:42')).toBeInTheDocument();
    expect(within(first).getByText('Mới')).toBeInTheDocument();
    const second = row('Trần Quốc Bảo');
    expect(within(second).getByText('trực tiếp')).toBeInTheDocument();
    expect(within(second).getByText('Hôm qua')).toBeInTheDocument();
    expect(within(second).getByText('Hẹn lịch')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nguyễn Thu Hà' })).toHaveAttribute(
      'href',
      `${INBOX_PATH}?lead=${LEAD_ID}`,
    );
    expect(screen.getByText('2 / 2 lead')).toBeInTheDocument();
    expect(screen.getByText(/Chọn một lead trong danh sách/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xuất Excel / CSV' })).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('opens a lead beside the list with ways to reach them and the consent evidence', async () => {
    renderInbox();
    const { panel } = await openLead();

    expect(window.location.search).toBe(`?lead=${LEAD_ID}`);
    expect(within(panel).getByRole('heading', { level: 2, name: 'Nguyễn Thu Hà' })).toHaveFocus();
    expect(within(panel).getByText('24/10/2026 · 16:42 · từ điện thoại')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Gọi' })).toHaveAttribute(
      'href',
      'tel:+84901234567',
    );
    expect(within(panel).getByRole('link', { name: /Nhắn Zalo/ })).toHaveAttribute(
      'href',
      'https://zalo.me/0901234567',
    );
    expect(within(panel).getByRole('link', { name: 'thuha@example.com' })).toHaveAttribute(
      'href',
      'mailto:thuha@example.com',
    );
    expect(within(panel).getByText('Gọi sau 18h')).toBeInTheDocument();
    expect(within(panel).getByText('· v12')).toBeInTheDocument();
    expect(within(panel).getByText('facebook / cpc / uu-dai-t11')).toBeInTheDocument();
    expect(within(panel).getByText('Điện thoại')).toBeInTheDocument();
    expect(within(panel).getByText('24/10/2027')).toBeInTheDocument();
    expect(
      within(panel).getByText('Đồng ý để Công ty TNHH Nha khoa Smile Care xử lý dữ liệu'),
    ).toBeInTheDocument();
    expect(within(panel).getByText('Không chọn nhận ưu đãi')).toBeInTheDocument();
    expect(within(panel).getByText(/Nội dung đồng ý bản 2 · lúc 16:42:07/)).toBeInTheDocument();
    expect(row('Nguyễn Thu Hà')).toHaveClass(/selectedRow/);
    expect(screen.getByRole('link', { name: 'Nguyễn Thu Hà' })).toHaveAttribute(
      'aria-current',
      'true',
    );

    const user = userEvent.setup();
    await user.click(within(panel).getByRole('button', { name: 'Xem nội dung' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nội dung đồng ý bản 2' });
    expect(
      within(dialog).getByText(
        'Tôi đồng ý để Công ty TNHH Nha khoa Smile Care xử lý họ tên và số điện thoại của tôi.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'https://smilecare.vn/chinh-sach' }),
    ).toBeInTheDocument();
  });

  it('changes the status and saves a note, then refreshes the list and the counts', async () => {
    const { queryClient } = renderInbox();
    const { user, panel } = await openLead();

    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'Trạng thái lead' }),
      'contacted',
    );
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.updateLead).options).toHaveProperty('body', {
        status: 'contacted',
      });
    });
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeads).options).toHaveProperty('query', {
        folder: 'inbox',
        range: '7d',
        limit: 50,
      });
    });
    expect(queryClient.getQueryState(leadQueryKeys.counts(SITE_ID))?.isInvalidated).toBe(true);
    expect(within(panel).getByRole('combobox', { name: 'Trạng thái lead' })).toHaveValue(
      'contacted',
    );

    const note = within(panel).getByRole('textbox', { name: /Ghi chú nội bộ/ });
    await user.type(note, '  hẹn gọi lại sau 18h ');
    await user.click(within(panel).getByRole('button', { name: 'Lưu ghi chú' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.updateLead).options).toHaveProperty('body', {
        note: 'hẹn gọi lại sau 18h',
      });
    });
    expect(await screen.findByText('Đã lưu ghi chú')).toBeInTheDocument();
    expect(note).toHaveValue('hẹn gọi lại sau 18h');
    // The status saved before stays: the note did not overwrite it.
    expect(within(panel).getByRole('combobox', { name: 'Trạng thái lead' })).toHaveValue(
      'contacted',
    );
  });

  it('keeps the status control focusable while the change is being saved', async () => {
    renderInbox();
    const { user, panel } = await openLead();
    // The save never answers.
    apiMock.mockImplementation((endpoint) =>
      endpoint === endpoints.updateLead
        ? new Promise(() => undefined)
        : Promise.reject(new Error('unexpected call')),
    );
    const status = within(panel).getByRole('combobox', { name: 'Trạng thái lead' });

    await user.selectOptions(status, 'contacted');

    expect(status).toBeEnabled();
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveValue('contacted');
    await user.selectOptions(status, 'won');
    // A second choice while saving is ignored.
    expect(updateCalls()).toBe(1);
  });

  it('moves a lead to spam and back for editors, without the owner-only actions', async () => {
    renderInbox({ canManage: false });
    expect(screen.queryByRole('button', { name: 'Xuất Excel / CSV' })).not.toBeInTheDocument();
    const { user, panel } = await openLead();

    expect(
      within(panel).queryByRole('button', { name: 'Xuất dữ liệu người này' }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByRole('button', { name: 'Xóa dữ liệu người này' }),
    ).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Chuyển vào spam' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.updateLead).options).toHaveProperty('body', {
        spam: true,
      });
    });
    expect(await screen.findByText('Đã chuyển vào Nghi ngờ spam')).toBeInTheDocument();
    expect(
      within(panel).getByText('Một thành viên đã chuyển lead này vào Nghi ngờ spam.'),
    ).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Không phải spam' }));
    expect(await screen.findByText('Đã chuyển về Hộp thư')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Chuyển vào spam' })).toBeInTheDocument();
  });

  it('deletes the data of a person after a confirmation, then focuses the empty panel', async () => {
    renderInbox();
    const { user, panel } = await openLead();

    await user.click(within(panel).getByRole('button', { name: 'Xóa dữ liệu người này' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Xóa dữ liệu của Nguyễn Thu Hà?',
    });
    expect(dialog).toHaveTextContent(/Xóa 2 lead có cùng số điện thoại hoặc email/);
    expect(dialog).toHaveTextContent(/email trước đó không bị xóa/);
    await user.click(within(dialog).getByRole('button', { name: 'Xóa dữ liệu' }));

    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.deleteLeadPerson).args).toEqual([LEAD_ID]);
    });
    expect(await screen.findByText('Đã xóa 2 lead của người này')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Nguyễn Thu Hà' })).not.toBeInTheDocument();
    const empty = screen.getByRole('complementary', { name: 'Chi tiết lead' });
    await vi.waitFor(() => {
      expect(empty).toHaveFocus();
    });
    expect(window.location.search).toBe('');
  });

  it('exports the data of a person as JSON or CSV', async () => {
    downloadMock.mockResolvedValue({ truncated: false });
    renderInbox();
    const { user, panel } = await openLead();

    await user.click(within(panel).getByRole('button', { name: 'Xuất dữ liệu người này' }));
    await user.click(await screen.findByRole('menuitem', { name: 'File CSV (Excel)' }));
    await vi.waitFor(() => {
      expect(downloadMock).toHaveBeenCalledWith(endpoints.exportLeadPerson, [LEAD_ID], {
        body: { format: 'csv' },
      });
    });
    expect(await screen.findByText('Đã xuất dữ liệu người này')).toBeInTheDocument();
  });

  it('filters on the server, keeps the filters in the URL and waits for both days of a range', async () => {
    const user = userEvent.setup();
    renderInbox();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }), 'new');
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeads).options).toHaveProperty('query', {
        folder: 'inbox',
        range: '7d',
        status: 'new',
        limit: 50,
      });
    });
    expect(window.location.search).toBe('?status=new');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Lọc theo trang' }), PAGE_ID);
    expect(window.location.search).toBe(`?pageId=${PAGE_ID}&status=new`);

    apiMock.mockClear();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Khoảng thời gian' }), 'custom');
    expect(screen.getByRole('status')).toHaveTextContent('Chọn ngày bắt đầu và ngày kết thúc');
    await user.type(screen.getByLabelText('Từ ngày'), '2026-10-01');
    expect(apiMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Đến ngày'), '2026-10-31');
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeads).options).toHaveProperty('query', {
        folder: 'inbox',
        range: 'custom',
        pageId: PAGE_ID,
        status: 'new',
        from: '2026-10-01',
        to: '2026-10-31',
        limit: 50,
      });
    });
  });

  it('searches in a request body and never writes the search into the URL (rule 10)', async () => {
    const user = userEvent.setup();
    renderInbox();

    await user.type(screen.getByRole('searchbox', { name: 'Tìm lead' }), ' 0901 234 ');
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.searchLeads).options).toHaveProperty('body', {
        folder: 'inbox',
        range: '7d',
        q: '0901 234',
        limit: 50,
      });
    });
    expect(window.location.search).toBe('');
    expect(apiMock.mock.calls.some(([endpoint]) => endpoint === endpoints.listLeads)).toBe(false);

    downloadMock.mockResolvedValue({ truncated: false });
    await user.click(screen.getByRole('button', { name: 'Xuất Excel / CSV' }));
    await vi.waitFor(() => {
      expect(downloadMock).toHaveBeenCalledWith(endpoints.exportLeads, [SITE_ID], {
        body: { folder: 'inbox', range: '7d', q: '0901 234' },
      });
    });
  });

  it('loads more leads after the cursor and appends them', async () => {
    const user = userEvent.setup();
    const counts = { inbox: { count: 2, capped: false }, spam: { count: 0, capped: false } };
    renderInbox({ list: leadList([ha], { nextCursor: 'cursor-2', counts }) });
    serve([leadDetail(), baoDetail], leadList([bao], { counts }));
    expect(screen.getByText('1 / 2 lead')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));

    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeads).options).toHaveProperty('query', {
        folder: 'inbox',
        range: '7d',
        limit: 50,
        cursor: 'cursor-2',
      });
    });
    expect(await screen.findByRole('link', { name: 'Trần Quốc Bảo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nguyễn Thu Hà' })).toBeInTheDocument();
    expect(screen.getByText('2 / 2 lead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('exports the leads of the current filters and warns when the file is cut', async () => {
    downloadMock.mockResolvedValue({ truncated: true });
    const user = userEvent.setup();
    renderInbox({ filters: { ...DEFAULT_LEAD_FILTERS, folder: 'spam', range: 'all' } });

    await user.click(screen.getByRole('button', { name: 'Xuất Excel / CSV' }));
    await vi.waitFor(() => {
      expect(downloadMock).toHaveBeenCalledWith(endpoints.exportLeads, [SITE_ID], {
        body: { folder: 'spam', range: 'all' },
      });
    });
    expect(await screen.findByText('File chỉ gồm 10.000 lead mới nhất')).toBeInTheDocument();
  });

  it('shows an empty inbox with a way to see every lead', async () => {
    const user = userEvent.setup();
    renderInbox({ list: leadList([]) });

    expect(
      screen.getByRole('heading', { name: 'Chưa có lead nào trong 7 ngày qua' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xuất Excel / CSV' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Xem toàn bộ thời gian' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeads).options).toHaveProperty('query', {
        folder: 'inbox',
        range: 'all',
        limit: 50,
      });
    });
  });

  it('says an empty spam folder only covers the last 7 days, with a way to see every time', async () => {
    const user = userEvent.setup();
    renderInbox({ list: leadList([]), filters: { ...DEFAULT_LEAD_FILTERS, folder: 'spam' } });

    expect(
      screen.getByRole('heading', {
        name: 'Không có lead nào bị nghi ngờ spam trong 7 ngày qua',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xem toàn bộ thời gian' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeads).options).toHaveProperty('query', {
        folder: 'spam',
        range: 'all',
        limit: 50,
      });
    });
  });

  it('closes a lead that was deleted meanwhile and keeps focus in the panel', async () => {
    renderInbox({ leadId: LEAD_ID, details: [baoDetail] });
    const user = userEvent.setup();
    expect(await screen.findByText('Lead này không còn')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    const empty = screen.getByRole('complementary', { name: 'Chi tiết lead' });
    expect(empty).toHaveTextContent(/Chọn một lead trong danh sách/);
    expect(empty).toHaveFocus();
  });

  it('reopens a lead from the cache rather than the copy the page was rendered with', async () => {
    renderInbox({ leadId: LEAD_ID, initialDetail: leadDetail() });
    const panel = screen.getByRole('complementary', { name: 'Nguyễn Thu Hà' });
    const user = userEvent.setup();
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'Trạng thái lead' }),
      'contacted',
    );
    await vi.waitFor(() => {
      expect(updateCalls()).toBe(1);
    });

    await openLead('Trần Quốc Bảo');
    const { panel: again } = await openLead('Nguyễn Thu Hà');
    await vi.waitFor(() => {
      expect(within(again).getByRole('combobox', { name: 'Trạng thái lead' })).toHaveValue(
        'contacted',
      );
    });
  });

  it('opens "Nơi nhận lead" from the header, or right away when a publish check sent the user', async () => {
    const user = userEvent.setup();
    const { unmount } = renderInbox();
    await user.click(screen.getByRole('button', { name: 'Nơi nhận lead' }));
    expect(await screen.findByRole('dialog', { name: 'Nơi nhận lead' })).toBeInTheDocument();
    unmount();

    renderInbox({ recipientsOpen: true });
    expect(screen.getByRole('dialog', { name: 'Nơi nhận lead' })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.listLeadRecipients).args).toEqual([SITE_ID]);
    });
  });

  it('shows where a lead was emailed (ADR-018)', async () => {
    renderInbox();
    const { panel } = await openLead();
    const delivery = within(panel).getByRole('region', { name: 'Đã gửi tới' });
    expect(delivery).toHaveTextContent('Email thông báo · 2 người nhận');
    expect(delivery).toHaveTextContent('24/10/2026 16:42');
  });

  it('marks a lead whose email failed and sends it again from its detail', async () => {
    const failed = leadDetail({
      notification: {
        status: 'failed',
        attempts: 3,
        lastErrorCode: 'smtp_unavailable',
        sentAt: null,
        recipients: null,
        rejectedRecipients: null,
      },
    });
    renderInbox({
      list: leadList([leadItem({ notificationFailed: true }), bao]),
      details: [failed, baoDetail],
    });
    expect(within(row('Nguyễn Thu Hà')).getByText('Lỗi đồng bộ')).toBeInTheDocument();
    expect(within(row('Trần Quốc Bảo')).queryByText('Lỗi đồng bộ')).not.toBeInTheDocument();

    const { user, panel } = await openLead();
    const delivery = within(panel).getByRole('region', { name: 'Đã gửi tới' });
    expect(delivery).toHaveTextContent('Lỗi đồng bộ · không kết nối được máy chủ gửi thư');
    await user.click(within(delivery).getByRole('button', { name: 'Gửi lại' }));
    await vi.waitFor(() => {
      expect(lastCallTo(apiMock, endpoints.retryLeadNotification).args).toEqual([LEAD_ID]);
    });
    expect(await screen.findByText('Đang gửi lại email thông báo')).toBeInTheDocument();
    const after = within(panel).getByRole('region', { name: 'Đã gửi tới' });
    // The outcome is read out politely, and keyboard focus stays in the section.
    expect(within(after).getByRole('status')).toHaveTextContent('Đang gửi email thông báo');
    expect(within(after).getByRole('heading', { name: 'Đã gửi tới' })).toHaveFocus();
  });

  it('never offers to email a lead in spam, even one whose email failed before', async () => {
    const failedSpam = leadDetail({
      spam: { suspected: true, reasons: [] },
      notification: {
        status: 'failed',
        attempts: 3,
        lastErrorCode: 'smtp_unavailable',
        sentAt: null,
        recipients: null,
        rejectedRecipients: null,
      },
    });
    renderInbox({ details: [failedSpam, baoDetail] });
    const { panel } = await openLead();
    const delivery = within(panel).getByRole('region', { name: 'Đã gửi tới' });
    expect(delivery).toHaveTextContent('Không gửi email: lead nghi ngờ spam');
    expect(within(delivery).queryByRole('button', { name: 'Gửi lại' })).not.toBeInTheDocument();
  });

  it('gives the sidebar badge the counts loaded with the inbox, when they are newer', () => {
    const { queryClient } = renderWithProviders(<span />);
    // What the sidebar cached when the admin opened, before three more leads arrived.
    queryClient.setQueryData(
      leadQueryKeys.counts(SITE_ID),
      { new: { count: 2, capped: false }, last7Days: { count: 2, capped: false } },
      { updatedAt: LOADED_AT - 60_000 },
    );
    serve([], leadList([ha, bao]));
    const fresh: LeadCounts = {
      new: { count: 5, capped: false },
      last7Days: { count: 5, capped: false },
    };
    renderWithProviders(
      <LeadInbox
        site={siteFixture()}
        canManage
        initialFilters={DEFAULT_LEAD_FILTERS}
        initialLeadId={null}
        initialList={leadList([ha, bao])}
        initialDetail={null}
        pageRefs={pageRefs}
        leadCounts={fresh}
        initialRecipientsOpen={false}
        loadedAt={LOADED_AT}
      />,
      queryClient,
    );
    expect(queryClient.getQueryData(leadQueryKeys.counts(SITE_ID))).toEqual(fresh);
  });
});
