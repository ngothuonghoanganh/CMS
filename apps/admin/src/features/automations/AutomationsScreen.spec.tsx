import { type AutomationListItem, type AutomationListResponse, endpoints } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AutomationsScreen } from './AutomationsScreen';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const site = siteFixture();
// 16:50 on 5 November 2026 in Vietnam.
const LOADED_AT = Date.parse('2026-11-05T09:50:00.000Z');
const ANH = { id: '64b0000000000000000000e1', name: 'Ngọc Anh' };

function item(overrides: Partial<AutomationListItem> = {}): AutomationListItem {
  return {
    id: '64b0000000000000000000a1',
    name: 'Giao lead mới cho người trực',
    state: 'on',
    pausedReason: null,
    trigger: { kind: 'lead_created', pageIds: [] },
    missing: 0,
    createdBy: ANH,
    createdAt: '2026-10-14T03:00:00.000Z',
    lastRun: { status: 'succeeded', at: '2026-11-05T09:45:00.000Z' },
    last30Days: { runs: 412, failed: 0 },
    skippedForQuota: 0,
    ...overrides,
  };
}

const LIST: AutomationListResponse = {
  items: [
    item(),
    item({
      id: '64b0000000000000000000a2',
      name: 'Nhắc gọi lại nếu chưa liên hệ',
      trigger: { kind: 'lead_still_new', minutes: 15 },
      lastRun: { status: 'failed', at: '2026-11-05T03:02:00.000Z' },
      last30Days: { runs: 96, failed: 3 },
    }),
    item({
      id: '64b0000000000000000000a3',
      name: 'Báo quản lý khi chốt Implant',
      state: 'paused',
      pausedReason: 'user',
      trigger: { kind: 'opportunity_stage_changed', stage: 'won' },
    }),
    item({
      id: '64b0000000000000000000a4',
      name: 'Gắn nhãn VIP cho khách Implant',
      state: 'draft',
      trigger: { kind: 'opportunity_stage_changed', stage: null },
      missing: 1,
      lastRun: null,
      last30Days: { runs: 0, failed: 0 },
    }),
  ],
  usage: { used: 1240, limit: 2000, resetsOn: '2026-12-01' },
};

function render(role: 'owner' | 'support' = 'owner', list = LIST) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.listAutomations) {
      return Promise.resolve(list);
    }
    if (endpoint === endpoints.createAutomation) {
      return Promise.resolve(
        item({
          id: '64b0000000000000000000b1',
          name: 'Báo tin khi chốt được khách',
          state: 'draft',
          lastRun: null,
        }),
      );
    }
    if (endpoint === endpoints.setAutomationState) {
      return Promise.resolve(item({ state: 'paused', pausedReason: 'user' }));
    }
    return Promise.reject(new Error(`Unexpected call to ${endpoint.method}`));
  });
  return renderWithProviders(
    <AutomationsScreen
      site={site}
      role={role}
      roleLabel={role === 'owner' ? 'Chủ sở hữu' : 'Chăm sóc khách hàng'}
      initial={list}
      loadedAt={LOADED_AT}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(LOADED_AT);
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.mockReset();
});

describe('AutomationsScreen (board 25)', () => {
  it('lists each automation with its trigger, state, last run and month, as the board does', () => {
    render();
    expect(screen.getByText('1.240 lượt chạy tháng này · hạn mức 2.000')).toBeInTheDocument();
    const rows = within(screen.getByRole('region', { name: 'Automation của site' })).getAllByRole(
      'row',
    );
    expect(rows[1]).toHaveTextContent('Giao lead mới cho người trực');
    expect(rows[1]).toHaveTextContent('Ngọc Anh · 14/10');
    expect(rows[1]).toHaveTextContent('Có lead mới');
    expect(rows[1]).toHaveTextContent('Đang bật');
    expect(rows[1]).toHaveTextContent('Thành công · 5 phút trước');
    expect(rows[1]).toHaveTextContent('412 lượt · 0 lỗi');
    expect(rows[2]).toHaveTextContent('Lead còn “Mới” sau 15 phút');
    expect(rows[2]).toHaveTextContent('Cần xử lý');
    expect(rows[3]).toHaveTextContent('Cơ hội chuyển sang Thắng');
    expect(rows[3]).toHaveTextContent('Tạm dừng');
    expect(rows[4]).toHaveTextContent('Cơ hội đổi giai đoạn');
    expect(rows[4]).toHaveTextContent('Bản nháp');
    expect(rows[4]).toHaveTextContent('Chưa chạy');
    expect(screen.getByRole('switch', { name: 'Bật Giao lead mới cho người trực' })).toBeChecked();
    // A draft missing a step cannot be enabled.
    expect(
      screen.getByRole('switch', { name: 'Bật Gắn nhãn VIP cho khách Implant' }),
    ).toBeDisabled();
  });

  it('starts a draft from a recipe and pauses one from its switch', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: /Báo tin khi chốt được khách/ }));
    expect(lastCallTo(apiMock, endpoints.createAutomation).options).toEqual({
      body: { recipe: 'notify_won' },
    });
    expect(
      await screen.findByText('Đã tạo bản nháp “Báo tin khi chốt được khách”'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Bật Giao lead mới cho người trực' }));
    expect(lastCallTo(apiMock, endpoints.setAutomationState)).toMatchObject({
      args: [site.id, '64b0000000000000000000a1'],
      options: { body: { state: 'paused' } },
    });
  });

  it('says when the month’s runs ran out', () => {
    render('owner', { ...LIST, usage: { used: 2000, limit: 2000, resetsOn: '2026-12-01' } });
    expect(
      screen.getByText('Đã dùng hết 2.000 lượt tháng này. Automation chạy lại từ 01/12.'),
    ).toBeInTheDocument();
  });

  it('only shows the list to a role that views, saying why', () => {
    render('support');
    expect(screen.queryByRole('heading', { name: 'Bắt đầu từ mẫu' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Bạn đang xem với vai trò Chăm sóc khách hàng\. Bật, tạm dừng hay sửa/),
    ).toBeInTheDocument();
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toBeDisabled();
    }
  });
});
