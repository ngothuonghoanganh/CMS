import {
  type AiSuggestionChange,
  type AiSuggestionEvent,
  type AiSuggestionRequest,
  type AiSuggestionResult,
  type AiUsage,
  endpoints,
} from '@plp/contracts';
import { getAtPath } from '@plp/sections/schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, streamEndpoint } from '../../../lib/api';
import { apiError } from '../../shell/test-utils';
import { Canvas } from '../Canvas';
import { useEditorServices } from '../editor-context';
import { type SideTab, SidePanel } from '../SidePanel';
import type { EditorStore } from '../store';
import { makeStore, PAGE_ID, sectionById, SITE_ID } from '../test-fixtures';
import { renderEditor } from '../test-render';
import { AI_PANEL_ID, AiAssistantProvider } from './ai-assistant-context';
import { AiAssistantPanel } from './AiAssistantPanel';
import { AiAppliedNotice } from './AiAppliedNotice';

vi.mock(import('../../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
  streamEndpoint: vi.fn(),
}));

const apiMock = vi.mocked(api);
const streamMock = vi.mocked(streamEndpoint);

// jsdom has no innerText, which canvas text reads when it loses focus; for text without line
// elements it equals textContent.
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  configurable: true,
  get(this: HTMLElement) {
    return this.textContent;
  },
});

const HERO = 'hero00000001';

/** Queries inside the assistant's panel: the editor's announcer says the same words. */
function inPanel() {
  const panel = document.getElementById(AI_PANEL_ID);
  if (panel === null) {
    throw new Error('The assistant panel is not drawn');
  }
  return within(panel);
}

function usage(overrides: Partial<AiUsage> = {}): AiUsage {
  return {
    enabled: true,
    month: '2026-11',
    limit: 100,
    used: 4,
    remaining: 96,
    resetsOn: '2026-12-01',
    ...overrides,
  };
}

function heroText(store: EditorStore, path: string): string {
  return String(getAtPath(sectionById(store, HERO).content, path));
}

function result(changes: AiSuggestionChange[], overrides: Partial<AiSuggestionResult> = {}) {
  const ok = changes.some((change) => change.status === 'ok');
  return {
    changes,
    charged: ok,
    failure: ok ? null : 'ai_unavailable',
    usage: usage(ok ? { used: 5, remaining: 95 } : {}),
    ...overrides,
  } satisfies AiSuggestionResult;
}

/** A suggestion request the test answers when it chooses, and what it was sent. */
interface PendingSuggestion {
  body: AiSuggestionRequest;
  signal: AbortSignal | undefined;
  answer: (value: AiSuggestionResult) => Promise<void>;
  fail: (error: Error) => Promise<void>;
}

const pending: PendingSuggestion[] = [];

function serve(usageNow: AiUsage = usage()) {
  pending.length = 0;
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.aiUsage
      ? Promise.resolve(usageNow)
      : Promise.reject(new Error('unexpected call')),
  );
  streamMock.mockImplementation((_endpoint, _args, options, _schema, onEvent) => {
    const { body, signal } = options as { body: AiSuggestionRequest; signal?: AbortSignal };
    return new Promise<void>((resolve, reject) => {
      pending.push({
        body,
        signal,
        answer: async (value) => {
          await act(async () => {
            (onEvent as (event: AiSuggestionEvent) => void)({ type: 'heartbeat' });
            (onEvent as (event: AiSuggestionEvent) => void)({ type: 'result', result: value });
            resolve();
            await Promise.resolve();
          });
        },
        fail: async (error) => {
          await act(async () => {
            reject(error);
            await Promise.resolve();
          });
        },
      });
    });
  });
}

function last(): PendingSuggestion {
  const request = pending.at(-1);
  if (request === undefined) {
    throw new Error('No suggestion was requested');
  }
  return request;
}

/** The editor's assistant as the editor mounts it: the panel, the canvas and its notice. */
function Assistant({ store, canvas = false }: { store: EditorStore; canvas?: boolean }) {
  const { announce } = useEditorServices();
  return (
    <AiAssistantProvider store={store} siteId={SITE_ID} pageId={PAGE_ID} announce={announce}>
      <AiAssistantPanel />
      {canvas ? <Canvas /> : <AiAppliedNotice />}
    </AiAssistantProvider>
  );
}

function renderAssistant(options: { canvas?: boolean; select?: boolean } = {}) {
  const store = makeStore();
  if (options.select !== false) {
    store.getState().select(HERO);
  }
  const user = userEvent.setup();
  renderEditor(<Assistant store={store} canvas={options.canvas ?? false} />, { store });
  return { store, user };
}

const REWRITE: AiSuggestionChange[] = [
  {
    status: 'ok',
    sectionId: HERO,
    path: 'heading',
    before: 'x',
    after: 'Niềng răng không ai nhận ra, trả góp 0%',
    review: true,
  },
  {
    status: 'ok',
    sectionId: HERO,
    path: 'subheading',
    before: 'y',
    after: 'Chụp phim 3D miễn phí khi đăng ký trước.',
    review: false,
  },
];

describe('the AI assistant panel (board 21)', () => {
  beforeEach(() => {
    serve();
  });

  it('idle: the scope of the selection, the actions and the month’s uses', async () => {
    renderAssistant();
    const scope = await screen.findByRole('group', { name: 'Phạm vi' });
    expect(within(scope).getByRole('radio', { name: 'Section Hero' })).toBeChecked();
    // Nothing focused on the canvas or in the panel: no "Đoạn chữ" yet.
    expect(within(scope).getByRole('radio', { name: 'Đoạn chữ' })).toBeDisabled();
    const actions = screen.getByRole('group', { name: 'Tác vụ của trợ lý' });
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Viết lại',
      'Rút gọn',
      'Đổi giọng văn',
      'Gợi ý tiêu đề',
      'Gợi ý CTA',
      'Viết nội dung section',
      'Gợi ý SEO',
    ]);
    // SEO is the page's: it needs "Toàn trang", and says so.
    expect(screen.getByRole('button', { name: 'Gợi ý SEO' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Gợi ý SEO' })).toHaveAccessibleDescription(
      'Chọn phạm vi Toàn trang để gợi ý SEO.',
    );
    expect(
      screen.getByText('Còn 96/100 lượt tháng này · AI chỉ đọc chữ của bản nháp, không đọc lead.'),
    ).toBeInTheDocument();
  });

  it('running: says what it writes, keeps the other sections editable, and “Hủy” gives the use back', async () => {
    const { user } = renderAssistant({ canvas: true });
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    expect(last().body).toMatchObject({
      scope: { kind: 'section', sectionId: HERO },
      action: 'rewrite',
      instruction: '',
    });
    expect(inPanel().getByText('Đang viết lại Hero…')).toBeInTheDocument();
    expect(screen.getByText('Bạn vẫn sửa được các section khác.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Viết lại' })).toBeDisabled();
    expect(screen.getByText('Hero · AI đang đọc')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hủy' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(last().signal?.aborted).toBe(true);
    expect(
      inPanel().getByText('Đã hủy. Bản nháp không đổi và lượt này không bị tính.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hero · AI đang đọc')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã hủy.');
  });

  it('result → applied: one undo step, “Hoàn tác” brings the text back', async () => {
    const { store, user } = renderAssistant();
    const heading = heroText(store, 'heading');
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    await last().answer(result(REWRITE));

    const list = screen.getByRole('region', { name: 'Gợi ý cho Hero' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(
      within(list).getByText('Kiểm tra lại: câu này nêu số liệu, giá hay cam kết.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Có 2 gợi ý cho Hero.');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Gợi ý cho Hero' })).toHaveFocus();
    });
    // The month's uses come with the answer.
    expect(screen.getByText(/^Còn 95\/100 lượt tháng này/)).toBeInTheDocument();
    // Nothing changed before "Áp dụng".
    expect(heroText(store, 'heading')).toBe(heading);

    await user.click(within(list).getByRole('checkbox', { name: 'Mô tả' }));
    await user.click(screen.getByRole('button', { name: 'Áp dụng 1 thay đổi' }));
    expect(heroText(store, 'heading')).toBe('Niềng răng không ai nhận ra, trả góp 0%');
    expect(sectionById(store, HERO).reviewPaths).toEqual(['heading']);
    expect(store.getState().history.past).toHaveLength(1);
    expect(screen.getByText('Đã áp dụng 1 thay đổi vào bản nháp')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Đã áp dụng 1 thay đổi vào bản nháp.');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hoàn tác' })).toHaveFocus();
    });

    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(heroText(store, 'heading')).toBe(heading);
    expect(screen.queryByText('Đã áp dụng 1 thay đổi vào bản nháp')).not.toBeInTheDocument();
  });

  it('applied: “Hoàn tác” goes once the draft changed again; Ctrl+Z still walks back', async () => {
    const { store, user } = renderAssistant();
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    await last().answer(result(REWRITE));
    await user.click(screen.getByRole('button', { name: 'Áp dụng 2 thay đổi' }));
    expect(screen.getByRole('button', { name: 'Hoàn tác' })).toBeInTheDocument();
    act(() => {
      store.getState().updateContent(HERO, 'eyebrow', 'Ưu đãi');
    });
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument();
    expect(store.getState().history.past).toHaveLength(2);
  });

  it('partial: a failed part says so with “Thử lại”, and the apply counts the good ones', async () => {
    const { user } = renderAssistant();
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    await last().answer(
      result([
        ...REWRITE,
        {
          status: 'failed',
          sectionId: HERO,
          path: 'primaryCta.label',
          before: 'Đăng ký tư vấn',
          failure: 'ai_invalid_output',
        },
      ]),
    );
    expect(screen.getByText('Chưa viết được phần này')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áp dụng 2 thay đổi' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('1 phần chưa viết được.');

    await user.click(screen.getByRole('button', { name: 'Thử lại Nút chính' }));
    expect(last().body).toMatchObject({
      scope: { kind: 'field', sectionId: HERO, path: 'primaryCta.label' },
      action: 'rewrite',
    });
    await last().answer(
      result([
        {
          status: 'ok',
          sectionId: HERO,
          path: 'primaryCta.label',
          before: 'Đăng ký tư vấn',
          after: 'Nhận lịch tư vấn',
          review: false,
        },
      ]),
    );
    expect(screen.queryByText('Chưa viết được phần này')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áp dụng 3 thay đổi' })).toBeEnabled();
  });

  it('failed: the draft did not change, no use was spent, “Thử lại” asks again', async () => {
    const { user } = renderAssistant();
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    await last().answer(
      result([
        {
          status: 'failed',
          sectionId: HERO,
          path: 'heading',
          before: 'x',
          failure: 'ai_unavailable',
        },
      ]),
    );
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Chưa viết lại được Hero' }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'Kết nối tới dịch vụ AI bị gián đoạn. Bản nháp không đổi và lượt này không bị tính.',
    );
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(pending).toHaveLength(2);
    expect(inPanel().getByText('Đang viết lại Hero…')).toBeInTheDocument();
    await last().fail(apiError(429, 'rate_limited', 'Bạn gửi yêu cầu AI quá nhanh'));
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn gửi yêu cầu AI quá nhanh');
  });

  it('conflict: the section changed while the AI wrote; regenerate, or keep and overwrite', async () => {
    const { store, user } = renderAssistant();
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    act(() => {
      store.getState().updateContent(HERO, 'heading', 'Tôi sửa trong lúc AI chạy');
    });
    await last().answer(result(REWRITE));
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Hero đã thay đổi trong lúc AI chạy' }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'Bạn đã sửa Tiêu đề sau khi gửi yêu cầu. Gợi ý bên dưới dựa trên nội dung cũ; áp dụng sẽ ghi đè thay đổi đó.',
    );

    await user.click(within(alert).getByRole('button', { name: 'Tạo lại với nội dung mới' }));
    expect(last().body.sections[0]?.texts['heading']).toBe('Tôi sửa trong lúc AI chạy');
    act(() => {
      store.getState().updateContent(HERO, 'heading', 'Lại sửa nữa');
    });
    await last().answer(result(REWRITE));
    await user.click(screen.getByRole('button', { name: 'Vẫn xem gợi ý' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Áp dụng 2 thay đổi' }));
    expect(heroText(store, 'heading')).toBe('Niềng răng không ai nhận ra, trả góp 0%');
  });

  it('asks before overwriting text edited after the answer came', async () => {
    const { store, user } = renderAssistant();
    await user.click(await screen.findByRole('button', { name: 'Viết lại' }));
    await last().answer(result(REWRITE));
    act(() => {
      store.getState().updateContent(HERO, 'subheading', 'Sửa sau khi có gợi ý');
    });
    await user.click(screen.getByRole('button', { name: 'Áp dụng 2 thay đổi' }));
    expect(heroText(store, 'subheading')).toBe('Sửa sau khi có gợi ý');
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn đã sửa Mô tả sau khi gửi yêu cầu.');
  });

  it('“Đổi giọng văn” asks for a tone; the free request goes with the scope', async () => {
    const { user } = renderAssistant();
    await user.click(await screen.findByRole('button', { name: 'Đổi giọng văn' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Năng động' }));
    expect(last().body).toMatchObject({ action: 'change_tone', tone: 'energetic' });
    await user.click(screen.getByRole('button', { name: 'Hủy' }));

    await user.click(screen.getByRole('radio', { name: 'Toàn trang' }));
    const send = screen.getByRole('button', { name: 'Gửi yêu cầu' });
    expect(send).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: 'Yêu cầu cho trợ lý' }),
      'nhấn mạnh trả góp 0%',
    );
    await user.click(send);
    expect(last().body).toMatchObject({
      scope: { kind: 'page' },
      action: 'custom',
      instruction: 'nhấn mạnh trả góp 0%',
    });
    expect(last().body.sections).toHaveLength(5);
  });

  it('“Đoạn chữ” is the text being edited in the selected section', async () => {
    const { user } = renderAssistant({ canvas: true });
    const scope = await screen.findByRole('group', { name: 'Phạm vi' });
    const canvasHeading = screen
      .getByRole('region', { name: 'Khung xem trước bản nháp' })
      .querySelector<HTMLElement>(`[data-section-id="${HERO}"] [data-content-path="heading"]`);
    if (canvasHeading === null) {
      throw new Error('The canvas draws no Hero heading');
    }
    act(() => {
      canvasHeading.focus();
    });
    const field = within(scope).getByRole('radio', { name: 'Đoạn chữ' });
    expect(field).toBeEnabled();
    await user.click(field);
    await user.click(screen.getByRole('button', { name: 'Viết lại' }));
    expect(last().body.scope).toEqual({ kind: 'field', sectionId: HERO, path: 'heading' });
    expect(inPanel().getByText('Đang viết lại “Tiêu đề” của Hero…')).toBeInTheDocument();
  });

  it('quota: actions off, when the uses come back, no plan link', async () => {
    serve(usage({ used: 100, remaining: 0 }));
    renderAssistant();
    expect(await screen.findByRole('button', { name: 'Viết lại' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu' })).toBeDisabled();
    expect(
      screen.getByText(/Lượt mới có vào 01\/12\. Bạn vẫn sửa tay bình thường\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Đã dùng 100\/100 lượt tháng này/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem gói' })).not.toBeInTheDocument();
  });

  it('AI off: an explanation instead of the panel', async () => {
    serve(usage({ enabled: false }));
    renderAssistant();
    expect(await screen.findByText('AI chưa được bật')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Viết lại' })).not.toBeInTheDocument();
  });
});

describe('the right column’s tabs', () => {
  beforeEach(() => {
    serve();
  });

  function Column({ store }: { store: EditorStore }) {
    const [tab, setTab] = useState<SideTab>('properties');
    const { announce } = useEditorServices();
    return (
      <AiAssistantProvider store={store} siteId={SITE_ID} pageId={PAGE_ID} announce={announce}>
        <SidePanel tab={tab} onTabChange={setTab} />
      </AiAssistantProvider>
    );
  }

  it('shows “Thuộc tính” or “Trợ lý AI”, arrow keys moving between them', async () => {
    const store = makeStore();
    store.getState().select(HERO);
    const user = userEvent.setup();
    renderEditor(<Column store={store} />, { store });
    const properties = screen.getByRole('tab', { name: 'Thuộc tính' });
    expect(properties).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('complementary', { name: 'Hero' })).toBeVisible();
    // The assistant reads the month's uses only once opened.
    expect(apiMock).not.toHaveBeenCalled();

    properties.focus();
    await user.keyboard('{ArrowRight}');
    const assistant = screen.getByRole('tab', { name: 'Trợ lý AI' });
    expect(assistant).toHaveFocus();
    expect(assistant).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'Viết lại' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Hero' })).not.toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(screen.getByRole('complementary', { name: 'Hero' })).toBeVisible();
  });
});
