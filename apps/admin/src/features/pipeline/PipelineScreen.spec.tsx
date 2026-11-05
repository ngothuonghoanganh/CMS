import { endpoints, type Opportunity, type PipelineResponse } from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { siteFixture } from '../dashboard/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { PipelineScreen } from './PipelineScreen';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);
const site = siteFixture();
// 16:50 on 1 November 2026 in Vietnam.
const LOADED_AT = Date.parse('2026-11-01T09:50:00.000Z');
const HA = { id: '64b0000000000000000000e1', name: 'Thu Hà' };

function card(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: '64b0000000000000000000a1',
    title: 'Niềng răng Invisalign',
    stage: 'scheduled',
    value: 38_000_000,
    valueBy: HA,
    won: null,
    lost: null,
    owner: HA,
    contact: { id: '64b0000000000000000000c1', name: 'Nguyễn Thu Trang' },
    next: { title: 'Gọi xác nhận lịch', dueAt: '2026-11-01T09:25:00.000Z' },
    stageChangedAt: '2026-10-31T09:20:00.000Z',
    createdAt: '2026-10-28T07:02:00.000Z',
    ...overrides,
  };
}

const trang = card();
const duyen = card({
  id: '64b0000000000000000000a2',
  title: 'Niềng răng mắc cài sứ',
  stage: 'new',
  value: 28_000_000,
  contact: { id: '64b0000000000000000000c2', name: 'Phạm Mỹ Duyên' },
  next: null,
});
const han = card({
  id: '64b0000000000000000000a3',
  title: 'Implant 1 trụ',
  stage: 'won',
  value: 25_000_000,
  won: { value: 25_000_000, on: '2026-10-29' },
  contact: { id: '64b0000000000000000000c3', name: 'Võ Ngọc Hân' },
  next: null,
});

const PIPELINE: PipelineResponse = {
  columns: [
    { stage: 'new', count: 1, total: 28_000_000, items: [duyen] },
    { stage: 'contacted', count: 0, total: 0, items: [] },
    { stage: 'scheduled', count: 1, total: 38_000_000, items: [trang] },
    { stage: 'visited', count: 0, total: 0, items: [] },
    { stage: 'won', count: 1, total: 25_000_000, items: [han] },
    { stage: 'lost', count: 4, total: 0, items: [] },
  ],
  summary: { open: 2, openValue: 66_000_000, wonThisMonth: 1, lostThisMonth: 4 },
};

function render(canHandle = true) {
  apiMock.mockImplementation((endpoint) => {
    if (endpoint === endpoints.pipeline) {
      return Promise.resolve(PIPELINE);
    }
    if (endpoint === endpoints.moveOpportunity) {
      return Promise.resolve(card({ stage: 'visited' }));
    }
    if (endpoint === endpoints.listContacts) {
      return Promise.resolve({ items: [], nextCursor: null, counts: {} });
    }
    return Promise.reject(new Error(`Unexpected call to ${endpoint.method}`));
  });
  return renderWithProviders(
    <PipelineScreen
      site={site}
      canHandle={canHandle}
      initial={PIPELINE}
      options={{ assignees: [HA], tags: [] }}
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

describe('PipelineScreen (board 24)', () => {
  it('sums up the pipeline and shows a column per stage, lost folded away', async () => {
    const user = userEvent.setup();
    render();
    expect(
      screen.getByText(
        '2 cơ hội đang mở · giá trị dự kiến 66.000.000 ₫ · tháng này thắng 1, thua 4',
      ),
    ).toBeInTheDocument();
    const scheduled = screen.getByRole('region', { name: 'Hẹn lịch, 1 cơ hội' });
    // The column's total and the card's value.
    expect(within(scheduled).getAllByText('38.000.000 ₫')).toHaveLength(2);
    expect(within(scheduled).getByText('Gọi xác nhận lịch · quá hạn 25 phút')).toBeInTheDocument();
    expect(within(scheduled).getByLabelText('Phụ trách: Thu Hà')).toHaveTextContent('TH');
    expect(within(scheduled).getByRole('link', { name: /Niềng răng Invisalign/ })).toHaveAttribute(
      'href',
      `/sites/${site.id}/contacts/${trang.contact.id}`,
    );
    const won = screen.getByRole('region', { name: 'Thắng, 1 cơ hội' });
    expect(within(won).getByText('Thắng 29/10')).toBeInTheDocument();
    expect(within(won).getByRole('button', { name: 'Mở lại' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Thua/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thua · 4' }));
    expect(screen.getByRole('region', { name: 'Thua, 4 cơ hội' })).toBeInTheDocument();
  });

  it('moves a card from its menu, saying which stage it left', async () => {
    const user = userEvent.setup();
    render();
    const scheduled = screen.getByRole('region', { name: 'Hẹn lịch, 1 cơ hội' });
    await user.click(within(scheduled).getByRole('button', { name: /Chuyển giai đoạn/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Đã đến' }));
    expect(lastCallTo(apiMock, endpoints.moveOpportunity)).toMatchObject({
      args: [site.id, trang.id],
      options: { body: { stage: 'visited', from: 'scheduled' } },
    });
  });

  it('asks for the actual value and the day before marking won', async () => {
    const user = userEvent.setup();
    render();
    const scheduled = screen.getByRole('region', { name: 'Hẹn lịch, 1 cơ hội' });
    await user.click(within(scheduled).getByRole('button', { name: /Chuyển giai đoạn/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Đánh dấu thắng…' }));
    const dialog = screen.getByRole('dialog', { name: 'Đánh dấu thắng' });
    expect(
      within(dialog).getByText('Niềng răng Invisalign · Nguyễn Thu Trang'),
    ).toBeInTheDocument();
    const value = within(dialog).getByRole('textbox', { name: 'Giá trị thực tế' });
    expect(value).toHaveValue('38.000.000 ₫');
    await user.clear(value);
    await user.type(value, '36500000');
    await user.click(within(dialog).getByRole('button', { name: 'Đánh dấu thắng' }));
    expect(lastCallTo(apiMock, endpoints.moveOpportunity).options).toEqual({
      body: { stage: 'won', from: 'scheduled', value: 36_500_000, on: '2026-11-01' },
    });
  });

  it('needs a reason before marking lost', async () => {
    const user = userEvent.setup();
    render();
    const fresh = screen.getByRole('region', { name: 'Mới, 1 cơ hội' });
    await user.click(within(fresh).getByRole('button', { name: /Chuyển giai đoạn/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Đánh dấu thua…' }));
    const dialog = screen.getByRole('dialog', { name: 'Đánh dấu thua' });
    await user.click(within(dialog).getByRole('button', { name: 'Đánh dấu thua' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Chọn một lý do');
    await user.click(within(dialog).getByRole('radio', { name: 'Chọn nơi khác' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Ghi chú/ }), 'Gần nhà hơn');
    await user.click(within(dialog).getByRole('button', { name: 'Đánh dấu thua' }));
    expect(lastCallTo(apiMock, endpoints.moveOpportunity).options).toEqual({
      body: { stage: 'lost', from: 'new', reason: 'chose_elsewhere', note: 'Gần nhà hơn' },
    });
  });

  it('lists the cards with a stage select each, reopening a closed one first', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: 'Danh sách' }));
    const list = screen.getByRole('region', { name: 'Danh sách cơ hội' });
    expect(within(list).getAllByRole('row')).toHaveLength(4);
    await user.selectOptions(
      within(list).getByRole('combobox', { name: 'Giai đoạn của Implant 1 trụ' }),
      'contacted',
    );
    expect(lastCallTo(apiMock, endpoints.moveOpportunity).options).toEqual({
      body: { stage: 'visited', from: 'won' },
    });
  });

  it('only shows the board to a role that cannot change it', () => {
    render(false);
    expect(screen.queryByRole('button', { name: 'Tạo cơ hội' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chuyển giai đoạn/ })).not.toBeInTheDocument();
  });
});
