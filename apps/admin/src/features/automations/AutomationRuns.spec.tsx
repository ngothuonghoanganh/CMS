import {
  type AutomationDetail,
  type AutomationRunDetail,
  type AutomationRunListResponse,
  endpoints,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { AutomationRuns } from './AutomationRuns';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const site = siteFixture();
// 10:50 on 5 November 2026 in Vietnam.
const LOADED_AT = Date.parse('2026-11-05T03:50:00.000Z');
const HOOK = 'https://crm.smilecare.vn/api/leads';
const DUYEN = '64b0000000000000000000c1';
const NAM = '64b0000000000000000000c2';

const AUTOMATION: AutomationDetail = {
  id: '64b0000000000000000000a1',
  name: 'Gửi lead sang CRM của phòng khám',
  state: 'on',
  pausedReason: null,
  trigger: { kind: 'lead_created', pageIds: [] },
  missing: 0,
  createdBy: null,
  createdAt: '2026-10-14T03:00:00.000Z',
  lastRun: { status: 'failed', at: '2026-11-05T03:42:05.000Z' },
  last30Days: { runs: 410, failed: 3 },
  skippedForQuota: 0,
  version: 2,
  definition: {
    trigger: { kind: 'lead_created', pageIds: [] },
    conditions: [],
    actions: [
      { kind: 'add_tag', tag: 'Facebook' },
      { kind: 'webhook', url: HOOK, secretId: 's1' },
    ],
  },
  updatedAt: '2026-11-01T03:00:00.000Z',
  options: { members: [], pages: [], tags: [] },
  revealedSecrets: [],
};

const LIST: AutomationRunListResponse = {
  items: [
    {
      id: DUYEN,
      status: 'failed',
      trigger: 'lead_created',
      contactName: 'Phạm Mỹ Duyên',
      createdAt: '2026-11-05T03:02:11.000Z',
    },
    {
      id: NAM,
      status: 'succeeded',
      trigger: 'lead_created',
      contactName: 'Lê Hoàng Nam',
      createdAt: '2026-11-04T14:30:00.000Z',
    },
  ],
  nextCursor: null,
  failed: 3,
  failedLastDay: 3,
  last30Days: { runs: 410, failed: 3 },
};

const FAILED_RUN: AutomationRunDetail = {
  ...(LIST.items[0] as AutomationRunListResponse['items'][number]),
  eventKey: 'lead:64b0000000000000000000f1',
  version: 2,
  definition: AUTOMATION.definition,
  reason: null,
  steps: [
    {
      action: { kind: 'add_tag', tag: 'Facebook' },
      status: 'succeeded',
      attempts: 1,
      at: '2026-11-05T03:02:12.000Z',
      error: null,
      summary: 'gắn nhãn “Facebook”',
    },
    {
      action: { kind: 'webhook', url: HOOK, secretId: 's1' },
      status: 'failed',
      attempts: 3,
      at: '2026-11-05T03:42:05.000Z',
      error: { code: 'webhook_http_error', httpStatus: 500 },
      summary: null,
    },
  ],
  nextAt: null,
  finishedAt: '2026-11-05T03:42:05.000Z',
};

function render(automation = AUTOMATION, canManage = true) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.getAutomationRun) {
      return Promise.resolve(FAILED_RUN);
    }
    if (endpoint === endpoints.listAutomationRuns) {
      return Promise.resolve(LIST);
    }
    if (endpoint === endpoints.retryAutomationRun) {
      return Promise.resolve({ ...FAILED_RUN, status: 'queued' });
    }
    if (endpoint === endpoints.skipAutomationRun) {
      return Promise.resolve({ ...FAILED_RUN, status: 'skipped', reason: 'by_member' });
    }
    if (endpoint === endpoints.setAutomationState) {
      return Promise.resolve({ ...automation, state: 'on', pausedReason: null });
    }
    if (endpoint === endpoints.retryFailedAutomationRuns) {
      return Promise.resolve({ retried: 3 });
    }
    return Promise.reject(new Error(`Unexpected call to ${endpoint.method}`));
  });
  return renderWithProviders(
    <AutomationRuns
      site={site}
      automation={automation}
      initial={LIST}
      canManage={canManage}
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

describe('AutomationRuns (board 27)', () => {
  it('lists the runs and shows the failed one step by step, with how to fix it', async () => {
    render();
    expect(screen.getByText('30 ngày: 410 lượt · 3 lỗi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thất bại · 3' })).toBeInTheDocument();
    expect(
      screen.getByText(/Automation vẫn đang bật\. 3 lượt thất bại trong 24 giờ/),
    ).toBeInTheDocument();
    const runs = within(screen.getByRole('region', { name: 'Các lượt chạy' }));
    const first = runs.getByRole('button', { current: true });
    expect(first).toHaveTextContent('Lead mới · Phạm Mỹ Duyên10:02 hôm nayThất bại');
    expect(runs.getByRole('button', { name: /Lê Hoàng Nam/ })).toHaveTextContent('Hôm qua 21:30');

    expect(
      await screen.findByRole('heading', { name: 'Lượt chạy · lead Phạm Mỹ Duyên' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Thất bại ở bước 3')).toBeInTheDocument();
    expect(screen.getByText('Đã gắn nhãn “Facebook”.')).toBeInTheDocument();
    expect(screen.getByText(`POST ${HOOK} → 500 (3 lần)`)).toBeInTheDocument();
    expect(screen.getByText(/Lỗi nằm ở máy chủ nhận, không phải ở Payload/)).toBeInTheDocument();
  });

  it('retries the failed step and skips a run', async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole('button', { name: 'Thử lại bước này' }));
    expect(lastCallTo(apiMock, endpoints.retryAutomationRun).args).toEqual([
      site.id,
      AUTOMATION.id,
      DUYEN,
    ]);
    await user.click(screen.getByRole('button', { name: 'Bỏ qua lượt này' }));
    expect(lastCallTo(apiMock, endpoints.skipAutomationRun).args).toEqual([
      site.id,
      AUTOMATION.id,
      DUYEN,
    ]);
  });

  it('offers to enable again and retry when it paused itself after errors', async () => {
    const user = userEvent.setup();
    render({ ...AUTOMATION, state: 'paused', pausedReason: 'errors' });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Automation đã tự tạm dừng sau 20 lỗi liên tiếp.');
    await user.click(within(banner).getByRole('button', { name: 'Thử lại 3 lượt lỗi' }));
    expect(lastCallTo(apiMock, endpoints.setAutomationState).options).toEqual({
      body: { state: 'on' },
    });
    expect(lastCallTo(apiMock, endpoints.retryFailedAutomationRuns).args).toEqual([
      site.id,
      AUTOMATION.id,
    ]);
  });

  it('only shows the runs to a role that views', async () => {
    render(AUTOMATION, false);
    expect(await screen.findByText(`POST ${HOOK} → 500 (3 lần)`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại bước này' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ qua lượt này' })).not.toBeInTheDocument();
  });
});
