import { type AutomationDetail, endpoints } from '@plp/contracts';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AutomationEditor } from './AutomationEditor';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const site = siteFixture();
const LOADED_AT = Date.parse('2026-11-05T02:58:00.000Z');
const HA = { id: '64b0000000000000000000e1', name: 'Thu Hà' };
const PHUONG = { id: '64b0000000000000000000e2', name: 'Lan Phương' };
const ANH = { id: '64b0000000000000000000e3', name: 'Ngọc Anh' };

const DETAIL: AutomationDetail = {
  id: '64b0000000000000000000a1',
  name: 'Giao lead mới cho người trực',
  state: 'draft',
  pausedReason: null,
  trigger: { kind: 'lead_created', pageIds: [] },
  missing: 1,
  createdBy: ANH,
  createdAt: '2026-11-05T02:00:00.000Z',
  lastRun: null,
  last30Days: { runs: 0, failed: 0 },
  skippedForQuota: 0,
  version: 3,
  definition: {
    trigger: { kind: 'lead_created', pageIds: [] },
    conditions: [{ kind: 'source_contains', field: 'source', text: 'facebook' }],
    actions: [
      { kind: 'assign', memberIds: [HA.id, PHUONG.id] },
      { kind: 'create_task', title: 'Gọi lại trong 15 phút', dueInMinutes: 15, assignee: 'owner' },
      { kind: 'email', to: [], subject: 'Thông báo lead mới' },
    ],
  },
  updatedAt: '2026-11-05T02:58:00.000Z',
  options: { members: [HA, PHUONG, ANH], pages: [], tags: ['Niềng răng'] },
};

function render(detail = DETAIL, canManage = true) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.updateAutomation) {
      const body = (options as { body: { definition: AutomationDetail['definition'] } }).body;
      return Promise.resolve({ ...detail, definition: body.definition, missing: 0, version: 4 });
    }
    if (endpoint === endpoints.testAutomation) {
      return Promise.resolve({
        lead: { name: 'Phạm Mỹ Duyên', at: '2026-11-05T02:23:00.000Z' },
        trigger: { outcome: 'pass', text: 'Khớp: lead lúc 09:58' },
        conditions: [{ outcome: 'pass', text: 'Đạt: utm_source chứa “facebook”' }],
        actions: [
          { outcome: 'pass', text: 'Sẽ giao cho Thu Hà' },
          { outcome: 'pass', text: 'Sẽ tạo, hạn 10:13' },
          { outcome: 'skip', text: 'Bỏ qua: thiếu người nhận' },
        ],
      });
    }
    if (endpoint === endpoints.automationActivation) {
      return Promise.resolve({ leads: 312, recentUnassigned: 12, canIncludeRecent: true });
    }
    if (endpoint === endpoints.setAutomationState) {
      return Promise.resolve({ ...detail, state: 'on', missing: 0 });
    }
    return Promise.reject(new Error(`Unexpected call to ${endpoint.method}`));
  });
  return renderWithProviders(
    <AutomationEditor site={site} initial={detail} canManage={canManage} loadedAt={LOADED_AT} />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(LOADED_AT);
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.mockReset();
});

describe('AutomationEditor (board 26)', () => {
  it('shows KHI, NẾU and THÌ as steps, the one missing a recipient marked, and enabling held back', () => {
    render();
    const steps = within(screen.getByRole('region', { name: 'Các bước' }));
    const buttons = steps.getAllByRole('button', { pressed: false });
    expect(buttons[0]).toHaveTextContent('KHICó lead mớiTừ mọi trang có form của');
    expect(steps.getByRole('button', { name: /utm_source chứa “facebook”/ })).toBeInTheDocument();
    expect(
      steps.getByRole('button', { name: /Xoay vòng: Thu Hà, Lan Phương/ }),
    ).toBeInTheDocument();
    expect(
      steps.getByRole('button', { name: /“Gọi lại trong 15 phút” cho người phụ trách/ }),
    ).toBeInTheDocument();
    const email = steps.getByRole('button', { pressed: true });
    expect(email).toHaveTextContent('Gửi email nội bộ');
    expect(email).toHaveTextContent('Chưa chọn người nhận');
    expect(screen.getByText('1 bước thiếu cấu hình')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bật automation' })).toBeDisabled();
    const panel = screen.getByRole('complementary', { name: 'Bảng bên phải' });
    expect(within(panel).getByText('BƯỚC 5 · HÀNH ĐỘNG')).toBeInTheDocument();
    expect(
      within(panel).getByText('Chọn ít nhất một người nhận để bật automation.'),
    ).toBeInTheDocument();
  });

  it('saves a change after a pause, as a new version', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render();
    const panel = screen.getByRole('complementary', { name: 'Bảng bên phải' });
    await user.click(within(panel).getByRole('checkbox', { name: 'Ngọc Anh' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(lastCallTo(apiMock, endpoints.updateAutomation).options).toMatchObject({
      body: {
        name: 'Giao lead mới cho người trực',
        definition: { actions: [{}, {}, { kind: 'email', to: [ANH.id] }] },
      },
    });
    expect(await screen.findByText(/^Đã lưu/)).toBeInTheDocument();
    expect(screen.queryByText('1 bước thiếu cấu hình')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bật automation' })).toBeEnabled();
  });

  it('inserts a placeholder into the subject, and adds and removes steps', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render();
    const panel = screen.getByRole('complementary', { name: 'Bảng bên phải' });
    const subject = within(panel).getByRole('textbox', { name: /Tiêu đề/ });
    await user.clear(subject);
    await user.type(subject, 'Lead mới: ');
    await user.click(within(panel).getByRole('button', { name: '«Tên khách»' }));
    expect(subject).toHaveValue('Lead mới: «Tên khách»');

    await user.click(screen.getByRole('button', { name: /Thêm điều kiện hoặc hành động/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Thì · Gắn nhãn' }));
    expect(within(panel).getByText('BƯỚC 6 · HÀNH ĐỘNG')).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Xóa hành động “Gắn nhãn”' }));
    expect(within(panel).getByText('BƯỚC 1 · KHI')).toBeInTheDocument();
  });

  it('runs a test and shows each step’s result, then asks before enabling', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    render({
      ...DETAIL,
      missing: 0,
      definition: { ...DETAIL.definition, actions: DETAIL.definition.actions.slice(0, 2) },
    });
    await user.click(screen.getByRole('button', { name: 'Chạy thử' }));
    expect(await screen.findByText('Sẽ giao cho Thu Hà')).toBeInTheDocument();
    expect(screen.getByText('Khớp: lead lúc 09:58')).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.testAutomation).options).toMatchObject({
      body: { source: 'latest' },
    });
    const panel = screen.getByRole('complementary', { name: 'Bảng bên phải' });
    expect(within(panel).getByRole('combobox', { name: 'Dùng dữ liệu của' })).toHaveDisplayValue(
      'Lead gần nhất · Phạm Mỹ Duyên · 35 phút trước',
    );

    await user.click(screen.getByRole('button', { name: 'Bật automation' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Bật “Giao lead mới cho người trực”?',
    });
    expect(
      await within(dialog).findByText(
        'Automation chạy cho lead mới từ lúc bật. 312 lead cũ không bị ảnh hưởng.',
      ),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Chạy luôn cho 12 lead trong 24 giờ qua chưa có người phụ trách',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Bật automation' }));
    expect(lastCallTo(apiMock, endpoints.setAutomationState).options).toEqual({
      body: { state: 'on', includeRecent: true },
    });
  });

  it('keeps the steps of an enabled automation until it is paused', () => {
    render({ ...DETAIL, state: 'on', missing: 0 });
    expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Thêm điều kiện hoặc hành động/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Automation đang bật\. Tạm dừng để sửa các bước/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Tiêu đề/ })).toBeDisabled();
  });

  it('only shows the steps to a role that views', () => {
    render(DETAIL, false);
    expect(screen.queryByRole('button', { name: 'Chạy thử' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Thêm điều kiện hoặc hành động/ }),
    ).not.toBeInTheDocument();
  });
});
