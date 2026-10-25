import { endpoints, type PreviewLinkResponse } from '@plp/contracts';
import { ToastProvider } from '@plp/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { api } from '../../lib/api';
import type * as ApiModule from '../../lib/api';
import { EditorApp, type EditorInitialData, type PublishDialogRenderProps } from './EditorApp';
import { asset, pageDetail, site } from './test-fixtures';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, api: vi.fn() };
});

const apiMock = vi.mocked(api) as unknown as Mock<
  (endpoint: { path: (...args: string[]) => string }, args: string[]) => Promise<unknown>
>;

function initial(): EditorInitialData {
  return { detail: pageDetail(), site, assets: [asset], pages: [], role: 'owner' };
}

function noPublishDialog() {
  return null;
}

/** On mount the editor re-reads the page (Back/Forward check); it is unchanged here. */
function answerPage(other: (endpoint: unknown) => Promise<unknown> = () => Promise.resolve()) {
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.getPage ? Promise.resolve(pageDetail()) : other(endpoint),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function canvas() {
  return within(screen.getByRole('region', { name: 'Khung xem trước bản nháp' }));
}

beforeEach(() => {
  push.mockReset();
  apiMock.mockReset();
  answerPage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EditorApp', () => {
  it('shows the page, its save and live status, the draft notice and the canvas', () => {
    render(<EditorApp initial={initial()} renderPublishDialog={noPublishDialog} />, { wrapper });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ưu đãi niềng răng tháng 11' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Đã lưu bản nháp/)).toBeInTheDocument();
    expect(screen.getByText('Chưa xuất bản')).toBeInTheDocument();
    expect(
      screen.getByText('Chưa có gì được xuất bản. Bản nháp chỉ nhóm của bạn nhìn thấy.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quay lại danh sách trang' })).toHaveAttribute(
      'href',
      '/sites/64b000000000000000000001',
    );
    expect(canvas().getByText('Bản nháp · Máy tính')).toBeInTheDocument();
    expect(canvas().getAllByRole('textbox', { name: 'Tiêu đề' })[0]).toHaveTextContent(
      'Tiêu đề nói rõ lợi ích lớn nhất cho khách hàng',
    );
  });

  it('switches the preview device', async () => {
    const user = userEvent.setup();
    render(<EditorApp initial={initial()} renderPublishDialog={noPublishDialog} />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Điện thoại' }));
    expect(canvas().getByText('Bản nháp · Điện thoại (390 px)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Máy tính bảng' }));
    expect(canvas().getByText('Bản nháp · Máy tính bảng (768 px)')).toBeInTheDocument();
  });

  it('announces save states, not the passing time of the last save', () => {
    render(<EditorApp initial={initial()} renderPublishDialog={noPublishDialog} />, { wrapper });
    const saveStatus = screen
      .getAllByRole('status')
      .find((element) => element.textContent.startsWith('Đã lưu bản nháp'));
    expect(saveStatus).toHaveTextContent(/^Đã lưu bản nháp$/);
    // The time of the last save is shown beside the live region.
    expect(saveStatus?.parentElement).toHaveTextContent(/^Đã lưu bản nháp· \S/);
  });

  it('opens the mounted publish dialog and routes "Sửa ngay" to the field', async () => {
    const user = userEvent.setup();
    let props: PublishDialogRenderProps | undefined;
    const renderPublishDialog = (next: PublishDialogRenderProps) => {
      props = next;
      return next.open ? <p>Hộp thoại xuất bản</p> : null;
    };
    render(<EditorApp initial={initial()} renderPublishDialog={renderPublishDialog} />, {
      wrapper,
    });
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }));
    expect(screen.getByText('Hộp thoại xuất bản')).toBeInTheDocument();
    expect(props?.pageId).toBe('64b000000000000000000002');
    await expect(props?.ensureSaved()).resolves.toMatchObject({ revision: 3 });

    props?.onFixTarget({ kind: 'section', sectionId: 'faq000000001', fieldPath: 'heading' });
    await waitFor(() => {
      expect(screen.queryByText('Hộp thoại xuất bản')).toBeNull();
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Câu hỏi thường gặp' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName(/^Tiêu đề/);
    });
  });

  it('selects a section from the canvas and deletes it after confirmation', async () => {
    const user = userEvent.setup();
    render(<EditorApp initial={initial()} renderPublishDialog={noPublishDialog} />, { wrapper });
    await user.click(canvas().getByText('Câu hỏi khách hàng hay hỏi nhất?'));
    const toolbar = screen.getByRole('toolbar', {
      name: 'Thao tác với section Câu hỏi thường gặp',
    });
    expect(screen.getByText('Section 4 / 5')).toBeInTheDocument();
    await user.click(within(toolbar).getByRole('button', { name: 'Xóa section' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Xóa section Câu hỏi thường gặp?' });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa section' }));
    expect(canvas().queryByText('Câu hỏi khách hàng hay hỏi nhất?')).toBeNull();
    expect(screen.getByText('4 section')).toBeInTheDocument();
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();
  });

  it('asks before leaving with unsaved changes and leaves at once when saved', async () => {
    const user = userEvent.setup();
    render(<EditorApp initial={initial()} renderPublishDialog={noPublishDialog} />, { wrapper });
    const back = screen.getByRole('link', { name: 'Quay lại danh sách trang' });
    await user.click(back);
    expect(push).toHaveBeenCalledWith('/sites/64b000000000000000000001');

    push.mockReset();
    await user.click(screen.getByRole('button', { name: 'Ẩn hoặc hiện Hero' }));
    await user.click(back);
    const dialog = screen.getByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' });
    expect(push).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog', { name: 'Rời editor khi chưa lưu xong?' })).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Lịch sử phiên bản' }));
    await user.click(screen.getByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
    expect(push).toHaveBeenCalledWith(
      '/sites/64b000000000000000000001/pages/64b000000000000000000002/history',
    );
  });

  it('opens the draft preview, or shows the link when the popup is blocked', async () => {
    const user = userEvent.setup();
    const preview: PreviewLinkResponse = {
      url: 'https://smilecare.payload.site/_preview/token',
      expiresAt: '2026-10-31T10:00:00.000Z',
    };
    answerPage(() => Promise.resolve(preview));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<EditorApp initial={initial()} renderPublishDialog={noPublishDialog} />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText('Trình duyệt đã chặn cửa sổ xem trước')).toBeInTheDocument();
    expect(open).toHaveBeenCalledWith(preview.url, '_blank');
    expect(screen.getByRole('link', { name: preview.url })).toHaveAttribute('href', preview.url);
    const [endpoint, args] =
      apiMock.mock.calls.find(([called]) => called === endpoints.createPreviewLink) ?? [];
    expect(endpoint?.path(...(args ?? []))).toBe('/pages/64b000000000000000000002/preview-links');
  });

  it('reminds that the live page keeps its look after the site theme changes', async () => {
    const user = userEvent.setup();
    const live = {
      status: { kind: 'live' as const, changeCount: 0, changes: [] },
      liveRelease: {
        id: '64b0000000000000000000e1',
        version: 12,
        slug: 'uu-dai-thang-11',
        publishedAt: '2026-10-20T08:00:00.000Z',
      },
      latestVersion: 12,
      liveUrl: 'https://smilecare.payload.site/uu-dai-thang-11',
    };
    const before = pageDetail(undefined, live);
    // The server derives the reminder from the live release's snapshot (ADR-015).
    const after = pageDetail(undefined, {
      ...live,
      siteChanges: [{ kind: 'site', label: 'Giao diện site: giao diện', sectionId: null }],
    });
    let reads = 0;
    apiMock.mockImplementation((endpoint) => {
      if (endpoint === endpoints.getPage) {
        reads += 1;
        return Promise.resolve(reads === 1 ? before : after);
      }
      return Promise.resolve(
        endpoint === endpoints.updateSite ? { ...site, themePresetId: 'sunset' } : undefined,
      );
    });
    render(
      <EditorApp
        initial={{ ...initial(), detail: before }}
        renderPublishDialog={noPublishDialog}
      />,
      { wrapper },
    );
    await waitFor(() => {
      expect(reads).toBe(1);
    });
    expect(screen.getByText('Live v12')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Giao diện site · màu & chữ/ }));
    await user.click(screen.getByRole('radio', { name: 'Hoàng hôn' }));
    await user.click(screen.getByRole('button', { name: 'Áp dụng giao diện' }));

    expect(await screen.findByText('Live v12 · Giao diện site đã đổi')).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang sửa/)).toHaveTextContent(
      'Giao diện site đã đổi sau khi xuất bản v12: trang live vẫn dùng giao diện cũ cho tới khi bạn xuất bản lại.',
    );
  });
});
