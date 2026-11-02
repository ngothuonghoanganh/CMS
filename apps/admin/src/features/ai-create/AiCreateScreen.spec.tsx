import {
  type AiJob,
  type AiJobEvent,
  type AiUsage,
  endpoints,
  type SlugAvailability,
} from '@plp/contracts';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, streamEndpoint } from '../../lib/api';
import { SITE_ID, siteFixture, WORKSPACE_ID } from '../dashboard/test-fixtures';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { AiCreateScreen } from './AiCreateScreen';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
  streamEndpoint: vi.fn(),
}));

const apiMock = vi.mocked(api);
const streamMock = vi.mocked(streamEndpoint);
const JOB_ID = '64b000000000000000000901';
const PAGE_ID = '64b000000000000000000902';

function usage(overrides: Partial<AiUsage> = {}): AiUsage {
  return {
    enabled: true,
    month: '2026-11',
    limit: 100,
    used: 2,
    remaining: 98,
    resetsOn: '2026-12-01',
    ...overrides,
  };
}

/** The job of the lead outline (7 sections), the footer left to the user. */
function job(
  statuses: AiJob['sections'][number]['status'][],
  overrides: Partial<AiJob> = {},
): AiJob {
  const types = [
    'navbar',
    'hero',
    'benefits',
    'testimonials',
    'faq',
    'lead_form',
    'footer',
  ] as const;
  return {
    id: JOB_ID,
    status: 'running',
    sections: types.map((type, index) => ({
      id: `section${String(index).padStart(5, '0')}`,
      type,
      variant: 'x',
      status: statuses[index] ?? 'queued',
    })),
    pageId: null,
    retriesLeft: 2,
    failure: null,
    ...overrides,
  };
}

const QUEUED = job(['queued', 'queued', 'queued', 'queued', 'queued', 'queued', 'kept']);

/** Answers slug checks as free and usage as given; a stream plays `events`. */
function serve(events: AiJobEvent[] = [], usageNow: AiUsage = usage()) {
  apiMock.mockImplementation((endpoint, _args, options) => {
    if (endpoint === endpoints.slugAvailability) {
      const query = (options as { query: { slug: string } }).query;
      const free: SlugAvailability = {
        slug: query.slug,
        available: true,
        reason: null,
        message: null,
      };
      return Promise.resolve(free);
    }
    if (endpoint === endpoints.aiUsage) {
      return Promise.resolve(usageNow);
    }
    return Promise.reject(new Error('unexpected call'));
  });
  streamMock.mockImplementation((_endpoint, _args, _options, _schema, onEvent) => {
    for (const event of events) {
      onEvent(event);
    }
    return Promise.resolve();
  });
}

/** A run whose stream the test drives: it has started, and ends or breaks when told. */
interface HeldStream {
  push: (event: AiJobEvent) => void;
  end: () => void;
  fail: (error: Error) => void;
}

function holdStream(started: AiJob): HeldStream {
  const held: HeldStream = { push: () => undefined, end: () => undefined, fail: () => undefined };
  streamMock.mockImplementation((_endpoint, _args, _options, _schema, onEvent) => {
    held.push = (event) => {
      act(() => {
        onEvent(event);
      });
    };
    onEvent({ type: 'started', job: started });
    return new Promise<void>((resolve, reject) => {
      held.end = resolve;
      held.fail = reject;
    });
  });
  return held;
}

function renderScreen(usageNow: AiUsage = usage()) {
  return renderWithProviders(<AiCreateScreen site={siteFixture()} usage={usageNow} />);
}

function fillBrief() {
  fireEvent.change(screen.getByRole('textbox', { name: /Sản phẩm hoặc dịch vụ/ }), {
    target: { value: 'Niềng răng trong suốt Invisalign' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /Khách hàng mục tiêu/ }), {
    target: { value: 'Người đi làm 22–35 tuổi ở TP.HCM' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /Điểm khác biệt/ }), {
    target: { value: 'Bác sĩ nhiều năm kinh nghiệm chỉnh nha.' },
  });
}

async function toStructure(user: ReturnType<typeof userEvent.setup>) {
  fillBrief();
  await waitFor(() => {
    expect(screen.getByText('Đường dẫn này dùng được.')).toBeInTheDocument();
  });
  await user.click(screen.getByRole('button', { name: 'Đề xuất cấu trúc trang' }));
  return screen.getByRole('list', { name: 'Các section của trang' });
}

beforeEach(() => {
  apiMock.mockReset();
  streamMock.mockReset();
  router.push.mockReset();
});

describe('AiCreateScreen (board 20)', () => {
  it('asks for the brief of the board, with the uses left and what is sent', () => {
    serve();
    renderScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Kể cho AI về trang bạn cần' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Còn 98/100 lượt tháng này')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Các bước tạo trang bằng AI' });
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Brief');
    expect(screen.getByRole('radio', { name: 'Thu lead tư vấn' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Thân thiện' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Ngôn ngữ' })).toHaveValue('vi');
    expect(screen.getByRole('textbox', { name: /Nội dung bạn đã có/ })).toBeInTheDocument();
    // Its label names the field, not the heading of the step.
    expect(screen.getByRole('textbox', { name: /^Tên trang/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Đường dẫn/ })).toBeInTheDocument();
    // Pasted text only: no file attachments (ADR-031).
    expect(screen.queryByText('Thêm tệp hoặc ảnh')).not.toBeInTheDocument();
    const aside = screen.getByRole('complementary', { name: 'AI làm gì với trang của bạn' });
    expect(within(aside).getByText(/nội dung bạn nhập ở brief, tên site/)).toBeInTheDocument();
    expect(
      within(aside).getByText(/lead, danh bạ khách hàng, nội dung đồng ý/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hủy và quay lại' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Chọn template thay vì AI' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?site=${SITE_ID}`,
    );
  });

  it('points at the first missing field', async () => {
    const user = userEvent.setup();
    serve();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Đề xuất cấu trúc trang' }));
    expect(screen.getByRole('textbox', { name: /Sản phẩm hoặc dịch vụ/ })).toHaveFocus();
    expect(screen.getByText('Nhập sản phẩm hoặc dịch vụ')).toBeInTheDocument();
    expect(screen.getByText('Nhập điểm khác biệt và thông điệp chính')).toBeInTheDocument();
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('proposes the goal’s structure, which the user arranges before any use', async () => {
    const user = userEvent.setup();
    serve();
    renderScreen();
    const list = await toStructure(user);
    expect(screen.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toHaveFocus();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(rows[1]).toHaveTextContent('Hero + nút đặt lịch');
    expect(rows[1]).toHaveTextContent('Thông điệp chính đầu trang, kèm nút kêu gọi hành động.');
    // The navigation bar stays first and the footer last.
    expect(screen.getByRole('button', { name: 'Đưa Hero + nút đặt lịch lên' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Đưa Thanh điều hướng + nút liên hệ xuống' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Đưa Câu hỏi thường gặp lên' }));
    expect(within(list).getAllByRole('listitem')[3]).toHaveTextContent('Câu hỏi thường gặp');
    expect(screen.getByRole('status')).toHaveTextContent('Đã đưa Câu hỏi thường gặp tới vị trí 4.');
    await user.click(screen.getByRole('button', { name: 'Bỏ Cảm nhận khách hàng' }));
    expect(within(list).queryByText('Cảm nhận khách hàng')).not.toBeInTheDocument();
    // Focus goes to the row that took its place.
    expect(screen.getByRole('button', { name: 'Bỏ Form đăng ký tư vấn' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Thêm section' }));
    await screen.findByRole('menu');
    expect(
      screen.getByRole('menuitem', { name: /Form đăng ký.*Đã có trên trang/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Gọi / Zalo nhanh' }));
    expect(within(list).getAllByRole('listitem').at(-2)).toHaveTextContent('Gọi / Zalo nhanh');
    expect(streamMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' })).toBeEnabled();
  });

  it('keeps focus on the moved row when it reaches the navigation bar', async () => {
    const user = userEvent.setup();
    serve();
    renderScreen();
    const list = await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Đưa Lợi ích chính lên' }));
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Lợi ích chính');
    // Right after the navigation bar it cannot go up any more: the other arrow takes the focus.
    expect(screen.getByRole('button', { name: 'Đưa Lợi ích chính lên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa Lợi ích chính xuống' })).toHaveFocus();
  });

  it('says each section’s progress in one sentence, and shows the use the run reserved', async () => {
    const user = userEvent.setup();
    serve([], usage());
    renderScreen();
    await toStructure(user);
    serve([], usage({ used: 3, remaining: 97 }));
    const stream = holdStream(QUEUED);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    // The run reserved one use when it started: the header says so while it writes.
    expect(await screen.findByText('Còn 97/100 lượt tháng này')).toBeInTheDocument();

    const progress = screen.getByRole('list', { name: 'Tiến độ viết' });
    expect(progress).not.toHaveAttribute('aria-live');
    stream.push({ type: 'section', sectionId: 'section00001', status: 'writing' });
    expect(screen.getByRole('status')).toHaveTextContent('Đang viết Hero + nút đặt lịch…');
    stream.push({ type: 'section', sectionId: 'section00001', status: 'done' });
    expect(screen.getByRole('status')).toHaveTextContent('Đã viết xong Hero + nút đặt lịch.');
    stream.push({ type: 'section', sectionId: 'section00002', status: 'failed' });
    expect(screen.getByRole('status')).toHaveTextContent('Chưa viết được Lợi ích chính.');
  });

  it('gives the use back on the header when the run is cancelled', async () => {
    const user = userEvent.setup();
    serve();
    renderScreen();
    await toStructure(user);
    serve([], usage({ used: 3, remaining: 97 }));
    const stream = holdStream(QUEUED);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    expect(await screen.findByText('Còn 97/100 lượt tháng này')).toBeInTheDocument();
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.cancelAiPageJob) {
        stream.push({ type: 'finished', job: { ...QUEUED, status: 'cancelled' } });
        stream.end();
        return Promise.resolve({ ...QUEUED, status: 'cancelled' });
      }
      return endpoint === endpoints.aiUsage
        ? Promise.resolve(usage())
        : Promise.reject(new Error('unexpected call'));
    });
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(await screen.findByText('Còn 98/100 lượt tháng này')).toBeInTheDocument();
  });

  it('writes the content, showing each section, then opens the draft in the editor', async () => {
    const user = userEvent.setup();
    const done = job(['done', 'done', 'done', 'done', 'done', 'done', 'kept'], {
      status: 'done',
      pageId: PAGE_ID,
    });
    serve([
      { type: 'started', job: QUEUED },
      { type: 'section', sectionId: 'section00001', status: 'writing' },
      { type: 'finished', job: done },
    ]);
    renderScreen();
    await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));

    const [endpoint, args, options] = streamMock.mock.calls[0] ?? [];
    expect(endpoint).toBe(endpoints.startAiPageJob);
    expect(args).toEqual([SITE_ID]);
    expect((options as { body: unknown }).body).toMatchObject({
      title: 'Niềng răng trong suốt Invisalign',
      slug: 'nieng-rang-trong-suot-invisalign',
      brief: { product: 'Niềng răng trong suốt Invisalign', goal: 'lead', tone: 'friendly' },
      structure: [
        { type: 'navbar', variant: 'logo-cta' },
        { type: 'hero', variant: 'split' },
        { type: 'benefits', variant: 'grid' },
        { type: 'testimonials', variant: 'cards' },
        { type: 'faq', variant: 'accordion' },
        { type: 'lead_form', variant: 'stacked' },
        { type: 'footer', variant: 'basic' },
      ],
    });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
    });
    const progress = screen.getByRole('list', { name: 'Tiến độ viết' });
    expect(within(progress).getAllByRole('listitem')[1]).toHaveTextContent(
      'Hero + nút đặt lịchXong',
    );
    expect(within(progress).getAllByRole('listitem')[6]).toHaveTextContent('Bạn tự điền');
  });

  it('opens a partial draft or retries the failed sections for no use', async () => {
    const user = userEvent.setup();
    const partial = job(['done', 'done', 'done', 'done', 'failed', 'done', 'kept'], {
      status: 'done',
      pageId: PAGE_ID,
      failure: 'ai_invalid_output',
    });
    serve([
      { type: 'started', job: QUEUED },
      { type: 'finished', job: partial },
    ]);
    renderScreen();
    await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Gần xong' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã viết 5/6 section. 1 section chưa viết được. Thử lại không tốn thêm lượt.',
    );
    expect(screen.getByRole('link', { name: 'Mở bản nháp với 5 section' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/pages/${PAGE_ID}/edit`,
    );
    expect(router.push).not.toHaveBeenCalled();

    const written = job(['done', 'done', 'done', 'done', 'done', 'done', 'kept'], {
      status: 'done',
      pageId: PAGE_ID,
      retriesLeft: 1,
    });
    serve([
      { type: 'started', job: { ...partial, status: 'running' } },
      { type: 'finished', job: written },
    ]);
    await user.click(screen.getByRole('button', { name: 'Thử lại 1 section' }));
    expect(streamMock.mock.calls.at(-1)?.[0]).toBe(endpoints.retryAiPageJob);
    expect(streamMock.mock.calls.at(-1)?.[1]).toEqual([SITE_ID, JOB_ID]);
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith(`/sites/${SITE_ID}/pages/${PAGE_ID}/edit`);
    });
  });

  it('says why nothing was written, keeping the brief and structure', async () => {
    const user = userEvent.setup();
    serve([
      { type: 'started', job: QUEUED },
      {
        type: 'finished',
        job: job(['failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'kept'], {
          status: 'failed',
          failure: 'ai_overloaded',
        }),
      },
    ]);
    renderScreen();
    await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa tạo được nội dung.');
    expect(alert).toHaveTextContent(
      'Dịch vụ AI đang quá tải. Không có bản nháp nào được tạo và lượt này không bị tính.',
    );
    // Board 20 shows no progress once nothing was written: every row would say "Chờ".
    expect(screen.queryByRole('list', { name: 'Tiến độ viết' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sửa cấu trúc' }));
    expect(screen.getByRole('list', { name: 'Các section của trang' })).toBeInTheDocument();
  });

  it('“Thử lại” after a failure keeps the focus on the screen, not on <body>', async () => {
    const user = userEvent.setup();
    serve([
      { type: 'started', job: QUEUED },
      {
        type: 'finished',
        job: job(['failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'kept'], {
          status: 'failed',
          failure: 'ai_overloaded',
        }),
      },
    ]);
    renderScreen();
    await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    await screen.findByRole('alert');
    holdStream(QUEUED);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Đang viết nội dung' })).toHaveFocus();
    });
  });

  it('“Thử lại N section” keeps the focus on the screen while the sections are written again', async () => {
    const user = userEvent.setup();
    const partial = job(['done', 'done', 'done', 'done', 'failed', 'done', 'kept'], {
      status: 'done',
      pageId: PAGE_ID,
      failure: 'ai_invalid_output',
    });
    serve([
      { type: 'started', job: QUEUED },
      { type: 'finished', job: partial },
    ]);
    renderScreen();
    await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    await screen.findByRole('heading', { level: 1, name: 'Gần xong' });
    holdStream({ ...partial, status: 'running' });
    await user.click(screen.getByRole('button', { name: 'Thử lại 1 section' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Đang viết nội dung' })).toHaveFocus();
    });
  });

  it('keeps the last progress when the stream breaks, and “Xem tiến độ” keeps the focus', async () => {
    const user = userEvent.setup();
    serve();
    renderScreen();
    await toStructure(user);
    const stream = holdStream(QUEUED);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    stream.push({ type: 'section', sectionId: 'section00001', status: 'done' });
    await act(async () => {
      stream.fail(new TypeError('network error'));
      await Promise.resolve();
    });
    expect(await screen.findByText('Mất kết nối với máy chủ.')).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Tiến độ viết' })).getAllByRole(
      'listitem',
    );
    expect(rows[1]).toHaveTextContent('Hero + nút đặt lịchXong');
    expect(rows[6]).toHaveTextContent('Bạn tự điền');

    const partial = job(['done', 'done', 'done', 'done', 'failed', 'done', 'kept'], {
      status: 'done',
      pageId: PAGE_ID,
    });
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.getAiPageJob) {
        return Promise.resolve(partial);
      }
      return endpoint === endpoints.aiUsage
        ? Promise.resolve(usage())
        : Promise.reject(new Error('unexpected call'));
    });
    await user.click(screen.getByRole('button', { name: 'Xem tiến độ' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gần xong' })).toHaveFocus();
  });

  it('cancels a running job: back to the structure, the use not counted', async () => {
    const user = userEvent.setup();
    serve();
    let push: (event: AiJobEvent) => void = () => undefined;
    let end: () => void = () => undefined;
    streamMock.mockImplementation((_endpoint, _args, _options, _schema, onEvent) => {
      push = onEvent;
      push({ type: 'started', job: QUEUED });
      return new Promise<void>((resolve) => {
        end = resolve;
      });
    });
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.cancelAiPageJob) {
        push({ type: 'finished', job: { ...QUEUED, status: 'cancelled' } });
        end();
        return Promise.resolve({ ...QUEUED, status: 'cancelled' });
      }
      if (endpoint === endpoints.aiUsage) {
        return Promise.resolve(usage());
      }
      if (endpoint === endpoints.slugAvailability) {
        return Promise.resolve({ slug: 'x', available: true, reason: null, message: null });
      }
      return Promise.reject(new Error('unexpected call'));
    });
    renderScreen();
    await toStructure(user);
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    expect(
      await screen.findByText(
        'Thường mất dưới một phút. Bạn có thể rời màn này, bản nháp sẽ có trong danh sách trang.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(
      await screen.findByText('Đã hủy. Không có bản nháp nào được tạo và lượt này không bị tính.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cấu trúc đề xuất' })).toBeInTheDocument();
  });

  it('keeps the brief and stops at the quota: no button, the date the uses come back', async () => {
    const user = userEvent.setup();
    const used = usage({ used: 100, remaining: 0 });
    serve([], used);
    renderScreen(used);
    expect(screen.getByText('Đã dùng 100/100 lượt tháng này')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Workspace đã dùng hết 100 lượt AI tháng này.');
    expect(alert).toHaveTextContent('Lượt mới có vào 01/12. Brief bạn nhập vẫn được giữ lại.');
    // No "Xem gói" before Phase 4.
    expect(within(alert).queryByText('Xem gói')).not.toBeInTheDocument();
    expect(within(alert).getByRole('link', { name: 'Dùng template' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?site=${SITE_ID}`,
    );
    fillBrief();
    expect(screen.getByRole('button', { name: 'Đề xuất cấu trúc trang' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Khách hàng mục tiêu/ }), '!');
    expect(screen.getByRole('textbox', { name: /Khách hàng mục tiêu/ })).toHaveValue(
      'Người đi làm 22–35 tuổi ở TP.HCM!',
    );
  });

  it('goes back to the brief when the month ran out meanwhile', async () => {
    const user = userEvent.setup();
    serve();
    streamMock.mockRejectedValue(
      apiError(429, 'ai_quota_exhausted', 'Workspace đã dùng hết 100 lượt AI tháng này'),
    );
    renderScreen();
    await toStructure(user);
    serve([], usage({ used: 100, remaining: 0 }));
    streamMock.mockRejectedValue(
      apiError(429, 'ai_quota_exhausted', 'Workspace đã dùng hết 100 lượt AI tháng này'),
    );
    await user.click(screen.getByRole('button', { name: 'Viết nội dung · tốn 1 lượt' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kể cho AI về trang bạn cần' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Đã dùng 100/100 lượt tháng này')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Sản phẩm hoặc dịch vụ/ })).toHaveValue(
      'Niềng răng trong suốt Invisalign',
    );
  });

  it('says AI is not enabled, and offers the other way to create a page', () => {
    serve();
    renderScreen(usage({ enabled: false }));
    expect(screen.getByRole('heading', { level: 1, name: 'AI chưa được bật' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dùng template' })).toHaveAttribute(
      'href',
      `/workspaces/${WORKSPACE_ID}/templates?site=${SITE_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Tạo trang theo mục tiêu' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/pages/new`,
    );
    expect(screen.queryByRole('button', { name: 'Đề xuất cấu trúc trang' })).toBeNull();
  });
});
