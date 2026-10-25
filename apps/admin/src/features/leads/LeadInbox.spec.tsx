import { endpoints, type LeadDetail, type LeadListResponse } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, downloadFile } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
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

interface Setup {
  list?: LeadListResponse;
  filters?: LeadInboxFilters;
  canManage?: boolean;
  leadId?: string | null;
  /** The open lead, or null when it no longer exists. */
  detail?: LeadDetail | null;
}

/** Answers the inbox's requests like the API, with `detail` for the open lead. */
function serve(detail: LeadDetail | null, list: LeadListResponse) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.getLead) {
      return detail === null
        ? Promise.reject(apiError(404, 'not_found', 'Không tìm thấy lead'))
        : Promise.resolve(detail);
    }
    if (endpoint === endpoints.updateLead) {
      return Promise.resolve({ ...detail, ...(options?.body ?? {}) });
    }
    if (endpoint === endpoints.deleteLeadPerson) {
      return Promise.resolve({ deletedCount: 2 });
    }
    if (endpoint === endpoints.listLeads || endpoint === endpoints.leadCounts) {
      return Promise.resolve(list);
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
  detail = leadDetail(),
}: Setup = {}) {
  serve(detail, list);
  return renderWithProviders(
    <LeadInbox
      site={siteFixture()}
      canManage={canManage}
      initialFilters={filters}
      initialLeadId={leadId}
      initialList={list}
      initialDetail={null}
      pageRefs={pageRefs}
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
    expect(screen.getByText('Mọi đăng ký từ form trên các trang của Nha khoa Smile Care.'));
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
    expect(within(dialog).getByRole('link', { name: 'https://smilecare.vn/chinh-sach' }));
  });

  it('changes the status and saves a note, then refreshes the list and the counts', async () => {
    const { queryClient } = renderInbox();
    // What the sidebar badge shows.
    queryClient.setQueryData(leadQueryKeys.counts(SITE_ID), {
      new: { count: 2, capped: false },
      last7Days: { count: 2, capped: false },
    });
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
  });

  it('moves a lead to spam for editors, without the owner-only actions', async () => {
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
  });

  it('deletes the data of a person after a confirmation that says what is kept', async () => {
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
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.listLeads,
      expect.anything(),
      expect.anything(),
    );
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

    expect(screen.getByRole('heading', { name: 'Chưa có lead nào trong 7 ngày qua' }));
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

  it('closes a lead that was deleted meanwhile', async () => {
    renderInbox({ leadId: LEAD_ID, detail: null });
    const user = userEvent.setup();
    expect(await screen.findByText('Lead này không còn')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.getByText(/Chọn một lead trong danh sách/)).toBeInTheDocument();
  });
});
