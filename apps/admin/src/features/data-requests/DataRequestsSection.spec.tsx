import { type DataRequestDetail, endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, downloadFile } from '../../lib/api';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { DataRequestsSection } from './DataRequestsSection';
import {
  dataRequest,
  dataRequestDetail,
  dataRequestList,
  OTHER_REQUEST_ID,
  OWNER,
  REQUEST_ID,
  SITE_ID,
} from './test-fixtures';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
  downloadFile: vi.fn(),
}));

const apiMock = vi.mocked(api);
const downloadMock = vi.mocked(downloadFile);

/** Sunday 25/10/2026, noon in Vietnam: the open request of the board is not late yet. */
const LOADED_AT = Date.parse('2026-10-25T05:00:00.000Z');

const completedWithdrawal = dataRequest({
  id: OTHER_REQUEST_ID,
  contact: { name: 'Phạm Gia Huy', phone: '+84912448019', email: null },
  type: 'withdraw_marketing',
  status: 'completed',
  receivedAt: '2026-10-15T12:02:00.000Z',
  respondedAt: '2026-10-16T03:00:00.000Z',
  completedAt: '2026-10-16T03:00:00.000Z',
  leads: { count: 2, capped: false },
  completedCount: 2,
});

function renderSection(items = [dataRequest(), completedWithdrawal]) {
  return renderWithProviders(
    <DataRequestsSection siteId={SITE_ID} initial={dataRequestList(items)} loadedAt={LOADED_AT} />,
  );
}

function section() {
  return screen.getByRole('region', { name: 'Yêu cầu từ người gửi form' });
}

function rowOf(name: string) {
  const cell = within(section()).getByText(name);
  const row = cell.closest('tr');
  if (row === null) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

/** Answers each endpoint the dialogs call; `detail` is what the server holds. */
function serve(detail: DataRequestDetail) {
  let current = detail;
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.getDataRequest) {
      return Promise.resolve(current);
    }
    if (endpoint === endpoints.respondDataRequest) {
      current = {
        ...current,
        status: 'responded',
        respondedAt: '2026-10-25T05:01:00.000Z',
        log: [
          ...current.log,
          { at: '2026-10-25T05:01:00.000Z', actor: OWNER, action: 'responded', count: null },
        ],
      };
      return Promise.resolve(current);
    }
    if (endpoint === endpoints.completeDataRequest) {
      current = {
        ...current,
        status: 'completed',
        completedAt: '2026-10-25T05:02:00.000Z',
        respondedAt: current.respondedAt ?? '2026-10-25T05:02:00.000Z',
        masked: current.type === 'delete',
        leads: current.type === 'delete' ? null : current.leads,
        matches: current.type === 'delete' ? [] : current.matches,
        log: [
          ...current.log,
          { at: '2026-10-25T05:02:00.000Z', actor: OWNER, action: 'completed', count: 1 },
        ],
      };
      return Promise.resolve(current);
    }
    if (endpoint === endpoints.listDataRequests) {
      return Promise.resolve(dataRequestList([current]));
    }
    return Promise.reject(new Error('unexpected call'));
  });
}

beforeEach(() => {
  apiMock.mockReset();
  downloadMock.mockReset();
  // The list the server loaded is fresh: the section does not fetch it again on mount.
  vi.setSystemTime(LOADED_AT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DataRequestsSection', () => {
  it('lists requests as on board 12: who, what, when, by when and where they stand', () => {
    renderSection();

    const open = rowOf('Lê Mai Anh');
    expect(within(open).getByText('0987 106 223 · 1 lead')).toBeInTheDocument();
    expect(within(open).getByText('Xóa toàn bộ dữ liệu')).toBeInTheDocument();
    expect(within(open).getByText('23/10 · 10:15')).toBeInTheDocument();
    expect(within(open).getByText('Phản hồi trước 27/10')).toBeInTheDocument();
    expect(within(open).getByText('Hoàn tất trước 20/11')).toBeInTheDocument();
    expect(within(open).getByText('Cần phản hồi')).toBeInTheDocument();
    expect(
      within(open).getByRole('button', { name: 'Xử lý yêu cầu của Lê Mai Anh' }),
    ).toBeInTheDocument();

    const done = rowOf('Phạm Gia Huy');
    expect(within(done).getByText('0912 448 019 · 2 lead')).toBeInTheDocument();
    expect(within(done).getByText('Rút lại đồng ý nhận ưu đãi')).toBeInTheDocument();
    expect(within(done).getByText('Hoàn tất 16/10')).toBeInTheDocument();
    expect(
      within(done).getByRole('button', { name: 'Xem nhật ký yêu cầu của Phạm Gia Huy' }),
    ).toBeInTheDocument();
  });

  it('explains the list while it is empty', () => {
    renderSection([]);
    expect(within(section()).getByText(/Chưa có yêu cầu nào/)).toBeInTheDocument();
    expect(within(section()).queryByRole('table')).toBeNull();
  });

  describe('Ghi nhận yêu cầu', () => {
    it('shows the deadlines of the receipt and records the request', async () => {
      // Friday 23/10/2026, 10:15 in Vietnam.
      vi.setSystemTime(new Date('2026-10-23T03:15:00.000Z'));
      const user = userEvent.setup();
      apiMock.mockResolvedValueOnce(dataRequestDetail());
      apiMock.mockResolvedValue(dataRequestList([dataRequest()]));
      renderSection([]);

      await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu' }));
      const dialog = screen.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });
      expect(within(dialog).getByLabelText('Ngày nhận')).toHaveValue('2026-10-23');
      expect(within(dialog).getByLabelText(/Giờ nhận/)).toHaveValue('10:15');
      expect(
        within(dialog).getByText(
          'Phản hồi trước 27/10/2026 · Hoàn tất trước 20/11/2026 (tính theo ngày làm việc)',
        ),
      ).toBeInTheDocument();

      await user.type(within(dialog).getByRole('textbox', { name: /Họ tên/ }), 'Lê Mai Anh');
      await user.type(within(dialog).getByRole('textbox', { name: 'Số điện thoại' }), '0987106223');
      await user.click(within(dialog).getByRole('radio', { name: /Xóa toàn bộ dữ liệu/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận' }));

      expect(lastCallTo(apiMock, endpoints.createDataRequest).options).toEqual({
        body: {
          name: 'Lê Mai Anh',
          phone: '0987106223',
          email: '',
          type: 'delete',
          receivedAt: '2026-10-23T03:15:00.000Z',
        },
      });
      expect(await screen.findByText('Đã ghi nhận yêu cầu', { exact: true })).toBeInTheDocument();
    });

    it('needs a phone number or an email, and the kind of request', async () => {
      const user = userEvent.setup();
      renderSection([]);
      await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu' }));
      const dialog = screen.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });

      await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận' }));

      const phone = within(dialog).getByRole('textbox', { name: 'Số điện thoại' });
      expect(phone).toHaveAccessibleDescription(
        expect.stringContaining('Nhập số điện thoại hoặc email của người yêu cầu'),
      );
      expect(phone).toHaveFocus();
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Chọn điều người đó yêu cầu');
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('refuses a receipt more than 30 days ago before asking the server', async () => {
      vi.setSystemTime(new Date('2026-10-23T03:15:00.000Z'));
      const user = userEvent.setup();
      renderSection([]);
      await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu' }));
      const dialog = screen.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'vy@gmail.com');
      await user.click(within(dialog).getByRole('radio', { name: /Xem dữ liệu đang lưu/ }));
      const day = within(dialog).getByLabelText('Ngày nhận');
      await user.clear(day);
      await user.type(day, '2026-09-01');

      await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận' }));

      expect(day).toHaveAccessibleDescription(
        expect.stringContaining('Chỉ ghi nhận được yêu cầu nhận trong 30 ngày qua'),
      );
      expect(day).toHaveFocus();
      expect(apiMock).not.toHaveBeenCalled();
    });

    it('puts a server refusal on its field', async () => {
      const user = userEvent.setup();
      apiMock.mockRejectedValueOnce(
        apiError(422, 'validation_failed', 'Dữ liệu không hợp lệ', [
          {
            path: ['receivedAt'],
            code: 'custom',
            message: 'Thời điểm nhận yêu cầu không được ở tương lai',
          },
        ]),
      );
      renderSection([]);
      await user.click(screen.getByRole('button', { name: 'Ghi nhận yêu cầu' }));
      const dialog = screen.getByRole('dialog', { name: 'Ghi nhận yêu cầu' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Số điện thoại' }), '0987106223');
      await user.click(within(dialog).getByRole('radio', { name: /Sửa thông tin/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Ghi nhận' }));

      const day = within(dialog).getByLabelText('Ngày nhận');
      expect(
        await within(dialog).findByText('Thời điểm nhận yêu cầu không được ở tương lai'),
      ).toBeInTheDocument();
      expect(day).toHaveFocus();
    });
  });

  describe('Xử lý', () => {
    it('answers the person, then deletes their data after a confirmation', async () => {
      const user = userEvent.setup();
      serve(dataRequestDetail());
      renderSection([dataRequest()]);

      await user.click(screen.getByRole('button', { name: 'Xử lý yêu cầu của Lê Mai Anh' }));
      const dialog = await screen.findByRole('dialog', { name: 'Xóa toàn bộ dữ liệu' });
      expect(await within(dialog).findByRole('link', { name: 'Lê Mai Anh' })).toHaveAttribute(
        'href',
        `/sites/${SITE_ID}/leads?lead=64b000000000000000000401&range=all`,
      );

      await user.click(within(dialog).getByRole('button', { name: 'Đã phản hồi người yêu cầu' }));
      expect(lastCallTo(apiMock, endpoints.respondDataRequest).args).toEqual([REQUEST_ID]);
      expect(await within(dialog).findByText(/Đã phản hồi người yêu cầu$/)).toBeInTheDocument();
      expect(
        within(dialog).queryByRole('button', { name: 'Đã phản hồi người yêu cầu' }),
      ).toBeNull();

      await user.click(within(dialog).getByRole('button', { name: 'Xóa dữ liệu và hoàn tất' }));
      // Nothing is deleted before the confirmation.
      expect(apiMock).not.toHaveBeenCalledWith(endpoints.completeDataRequest, expect.anything());
      const confirm = within(dialog).getByRole('button', { name: 'Xác nhận' });
      expect(confirm).toHaveFocus();
      expect(within(dialog).getByText(/Không hoàn tác được/)).toBeInTheDocument();
      await user.click(confirm);

      expect(lastCallTo(apiMock, endpoints.completeDataRequest).args).toEqual([REQUEST_ID]);
      expect(
        await within(dialog).findByText(/Dữ liệu của người này đã được xóa/),
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole('heading', { name: 'Xử lý' })).toBeNull();
    });

    it('exports the data of a person who asked to see it', async () => {
      const user = userEvent.setup();
      serve(dataRequestDetail({ type: 'access' }));
      downloadMock.mockResolvedValue({ truncated: false });
      renderSection([dataRequest({ type: 'access' })]);

      await user.click(screen.getByRole('button', { name: 'Xử lý yêu cầu của Lê Mai Anh' }));
      const dialog = await screen.findByRole('dialog', { name: 'Xem dữ liệu đang lưu' });
      await user.click(await within(dialog).findByRole('button', { name: 'Xuất dữ liệu' }));
      await user.click(screen.getByRole('menuitem', { name: 'File CSV (Excel)' }));

      expect(downloadMock).toHaveBeenCalledWith(endpoints.exportDataRequest, [REQUEST_ID], {
        body: { format: 'csv' },
      });
      expect(
        await screen.findByText('Đã xuất dữ liệu của người yêu cầu', { exact: true }),
      ).toBeInTheDocument();
      // Sending the copy completes the request, with no extra confirmation.
      await user.click(within(dialog).getByRole('button', { name: 'Đã gửi bản sao' }));
      expect(lastCallTo(apiMock, endpoints.completeDataRequest).args).toEqual([REQUEST_ID]);
    });

    it('shows the log of a completed request, with nothing left to do', async () => {
      const user = userEvent.setup();
      serve(
        dataRequestDetail({
          ...completedWithdrawal,
          log: [
            { at: '2026-10-15T12:05:00.000Z', actor: OWNER, action: 'created', count: null },
            { at: '2026-10-16T03:00:00.000Z', actor: OWNER, action: 'completed', count: 2 },
          ],
        }),
      );
      renderSection([completedWithdrawal]);

      await user.click(
        screen.getByRole('button', { name: 'Xem nhật ký yêu cầu của Phạm Gia Huy' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Rút lại đồng ý nhận ưu đãi' });
      const log = await within(dialog).findByRole('list', { name: 'Nhật ký' });
      expect(
        within(log)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        '15/10/2026 19:05 · Ngọc Anh · Ghi nhận yêu cầu',
        '16/10/2026 10:00 · Ngọc Anh · Đã rút đồng ý nhận ưu đãi ở 2 lead, hoàn tất',
      ]);
      expect(within(dialog).queryByRole('button', { name: /hoàn tất/ })).toBeNull();
    });
  });
});
