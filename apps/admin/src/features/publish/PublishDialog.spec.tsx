import {
  type CheckItem,
  type ChecksResult,
  endpoints,
  type PageSummary,
  type PublishResponse,
  type SaveDraftResponse,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../lib/api';
import { pageSummary, site, SITE_ID, PAGE_ID } from '../editor/test-fixtures';
import { lastCallTo, renderWithProviders } from '../shell/test-utils';
import { PublishDialog } from './PublishDialog';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const LIVE_RELEASE = {
  id: '64b0000000000000000000e1',
  version: 12,
  slug: 'uu-dai-thang-11',
  publishedAt: '2026-10-24T06:02:00.000Z',
};
const LIVE_URL = 'https://smilecare.payload.site/uu-dai-thang-11';

function livePage(overrides: Partial<PageSummary> = {}): PageSummary {
  return pageSummary({
    status: {
      kind: 'live_with_changes',
      changeCount: 2,
      changes: [
        { kind: 'modified', label: 'Sửa: Hero', sectionId: 'hero00000001' },
        { kind: 'seo', label: 'SEO: tiêu đề', sectionId: null },
      ],
    },
    liveRelease: LIVE_RELEASE,
    latestVersion: 12,
    liveUrl: LIVE_URL,
    ...overrides,
  });
}

function warning(fingerprint: string, title: string): CheckItem {
  return {
    code: 'image_alt_missing',
    severity: 'warning',
    fingerprint,
    title,
    description: 'Người dùng trình đọc màn hình không biết ảnh nói gì.',
    target: { kind: 'section', sectionId: 'hero00000001', fieldPath: 'image' },
  };
}

const altWarning = warning('image_alt_missing:hero', 'Ảnh Hero chưa có mô tả');
const sampleWarning = warning('sample_content:faq', 'Câu hỏi thường gặp còn nội dung mẫu');
const blockingItem: CheckItem = {
  code: 'required_field_empty',
  severity: 'blocking',
  fingerprint: 'required_field_empty:hero.heading',
  title: 'Hero chưa có tiêu đề',
  description: 'Nhập tiêu đề cho Hero.',
  target: { kind: 'section', sectionId: 'hero00000001', fieldPath: 'heading' },
};

function checks(overrides: Partial<ChecksResult> = {}): ChecksResult {
  return {
    revision: 5,
    blocking: [],
    warnings: [],
    passed: [
      { code: 'seo_title', title: 'Tiêu đề SEO' },
      { code: 'contrast_aa', title: 'Tương phản màu đạt AA' },
    ],
    ...overrides,
  };
}

function saved(page: PageSummary): SaveDraftResponse {
  return { revision: 5, updatedAt: '2026-10-24T08:00:00.000Z', page, checks: checks() };
}

function publishResponse(overrides: Partial<PublishResponse> = {}): PublishResponse {
  return {
    release: {
      id: '64b0000000000000000000e2',
      pageId: PAGE_ID,
      version: 13,
      slug: 'uu-dai-thang-11',
      note: '',
      changeSummary: [],
      sourceRevision: 5,
      createdBy: { id: '64b000000000000000000004', name: 'Ngọc Anh' },
      createdAt: '2026-10-24T08:01:00.000Z',
    },
    page: livePage({
      status: { kind: 'live', changeCount: 0, changes: [] },
      liveRelease: { ...LIVE_RELEASE, id: '64b0000000000000000000e2', version: 13 },
      latestVersion: 13,
    }),
    liveUrl: LIVE_URL,
    revalidation: 'ok',
    ...overrides,
  };
}

interface Setup {
  page?: PageSummary;
  result?: ChecksResult;
}

function renderDialog({ page = livePage(), result = checks() }: Setup = {}) {
  const props = {
    onOpenChange: vi.fn(),
    ensureSaved: vi.fn(() => Promise.resolve(saved(page))),
    onFixTarget: vi.fn(),
    onPageUpdated: vi.fn(),
  };
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.getChecks
      ? Promise.resolve(result)
      : Promise.reject(new Error('unexpected call')),
  );
  renderWithProviders(<PublishDialog open pageId={PAGE_ID} site={site} {...props} />);
  return props;
}

function publishButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Xuất bản v\d+$/ });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('PublishDialog', () => {
  it('saves the draft, loads the checks and shows the version change', async () => {
    const props = renderDialog({ result: checks({ warnings: [altWarning] }) });

    expect(await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' })).toBeInTheDocument();
    expect(props.ensureSaved).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(endpoints.getChecks, [PAGE_ID]);
    expect(screen.getByText('smilecare.payload.site/uu-dai-thang-11')).toBeInTheDocument();
    expect(screen.getByText('Đang live')).toBeInTheDocument();
    expect(screen.getByText('v13 · bản nháp hiện tại')).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'Các thay đổi' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Sửa: Hero', 'SEO: tiêu đề']);
    expect(screen.getByText('1 cảnh báo · 2 đạt')).toBeInTheDocument();
    expect(screen.getByText('2 mục đã đạt')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Bản v12 vẫn được lưu. Bạn có thể khôi phục bất cứ lúc nào trong Lịch sử phiên bản.',
      ),
    ).toBeInTheDocument();
  });

  it('lists the site settings the publish applies to the live page (ADR-015)', async () => {
    renderDialog({
      page: livePage({
        status: { kind: 'live', changeCount: 0, changes: [] },
        siteChanges: [
          { kind: 'site', label: 'Giao diện site: giao diện', sectionId: null },
          { kind: 'site', label: 'Giao diện site: logo', sectionId: null },
        ],
      }),
    });

    expect(await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' })).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'Các thay đổi' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Giao diện site: giao diện', 'Giao diện site: logo']);
    expect(publishButton()).toBeEnabled();
  });

  it('enables publishing only once every warning is skipped, with the reason linked', async () => {
    const user = userEvent.setup();
    renderDialog({ result: checks({ warnings: [altWarning, sampleWarning] }) });

    await screen.findByText('Cảnh báo · Ảnh Hero chưa có mô tả');
    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAccessibleDescription('Sửa hoặc bỏ qua 2 cảnh báo');

    const skips = screen.getAllByRole('button', { name: 'Bỏ qua lần này' });
    const [firstSkip, secondSkip] = skips;
    if (firstSkip === undefined || secondSkip === undefined) {
      throw new Error('two skip buttons expected');
    }
    await user.click(firstSkip);
    expect(firstSkip).toHaveAttribute('aria-pressed', 'true');
    expect(firstSkip).toHaveTextContent('Hoàn tác');
    expect(publishButton()).toHaveAccessibleDescription('Sửa hoặc bỏ qua 1 cảnh báo');
    expect(screen.getByText('1 cảnh báo · 1 đã bỏ qua · 2 đạt')).toBeInTheDocument();

    await user.click(secondSkip);
    expect(publishButton()).toBeEnabled();
    expect(screen.queryByText(/Sửa hoặc bỏ qua/)).not.toBeInTheDocument();

    await user.click(firstSkip);
    expect(firstSkip).toHaveAttribute('aria-pressed', 'false');
    expect(publishButton()).toBeDisabled();
  });

  it('blocks publishing on a blocking error and sends "Sửa ngay" to the field', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ result: checks({ blocking: [blockingItem] }) });

    await screen.findByText('Lỗi chặn · Hero chưa có tiêu đề');
    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toHaveAccessibleDescription('Sửa 1 lỗi để xuất bản');
    expect(screen.getByText('1 lỗi chặn · 2 đạt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sửa ngay' }));
    expect(props.onFixTarget).toHaveBeenCalledWith(blockingItem.target);
  });

  it('uses the first-publish copy for a page that was never published', async () => {
    renderDialog({ page: pageSummary({ slug: 'uu-dai-thang-11' }) });

    expect(await screen.findByRole('heading', { name: 'Xuất bản trang' })).toBeInTheDocument();
    expect(screen.getByText('Trang chưa từng xuất bản')).toBeInTheDocument();
    expect(screen.queryByText('Đang live')).not.toBeInTheDocument();
    expect(
      screen.getByText('Sau khi xuất bản, trang sẽ có địa chỉ công khai.'),
    ).toBeInTheDocument();
    expect(publishButton()).toHaveTextContent('Xuất bản v1');
  });

  it('publishes with the expectations and shows the live address with a QR code', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ result: checks({ warnings: [altWarning] }) });
    await screen.findByText('Cảnh báo · Ảnh Hero chưa có mô tả');
    await user.click(screen.getByRole('button', { name: 'Bỏ qua lần này' }));
    await user.type(screen.getByRole('textbox', { name: /Ghi chú cho phiên bản/ }), 'Đổi ảnh hero');

    const response = publishResponse();
    apiMock.mockResolvedValueOnce(response);
    await user.click(publishButton());

    expect(await screen.findByRole('heading', { name: 'v13 đã live' })).toBeInTheDocument();
    const { args, options } = lastCallTo(apiMock, endpoints.publish);
    expect(args).toEqual([PAGE_ID]);
    expect(options).toEqual({
      body: {
        expectedRevision: 5,
        expectedPublishedReleaseId: LIVE_RELEASE.id,
        acknowledgedWarnings: [altWarning.fingerprint],
        note: 'Đổi ảnh hero',
      },
      headers: { 'idempotency-key': expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown },
    });

    const qr = screen.getByRole('img', {
      name: 'Mã QR của smilecare.payload.site/uu-dai-thang-11',
    });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText('Quét mã để kiểm tra trên điện thoại')).toBeInTheDocument();
    expect(screen.getByText('smilecare.payload.site/uu-dai-thang-11')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Có vấn đề? Khôi phục v12' })).toHaveAttribute(
      'href',
      `/sites/${SITE_ID}/pages/${PAGE_ID}/history?restore=${LIVE_RELEASE.id}`,
    );
    expect(screen.getByRole('link', { name: /Mở trang live/ })).toHaveAttribute('href', LIVE_URL);
    expect(
      screen.queryByText('Trang live có thể mất tới 5 phút để cập nhật.'),
    ).not.toBeInTheDocument();
    expect(props.onPageUpdated).toHaveBeenLastCalledWith(response.page, expect.anything());

    await user.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('warns when the live page could not be refreshed and offers no restore after a first publish', async () => {
    const user = userEvent.setup();
    renderDialog({ page: pageSummary() });
    await screen.findByRole('heading', { name: 'Xuất bản trang' });
    apiMock.mockResolvedValueOnce(
      publishResponse({
        revalidation: 'failed',
        release: { ...publishResponse().release, version: 1 },
      }),
    );
    await user.click(publishButton());

    expect(await screen.findByRole('heading', { name: 'v1 đã live' })).toBeInTheDocument();
    expect(screen.getByText('Trang live có thể mất tới 5 phút để cập nhật.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Khôi phục/ })).not.toBeInTheDocument();
  });

  it('reloads the page and checks after a pointer conflict and retries with the same key', async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' });

    const movedLive = { ...LIVE_RELEASE, id: '64b0000000000000000000e9', version: 14 };
    apiMock.mockRejectedValueOnce(
      new ApiError(409, {
        type: 'about:blank',
        title: 'Trang live vừa được thay đổi bởi một thao tác khác',
        status: 409,
        code: 'pointer_conflict',
      }),
    );
    apiMock.mockResolvedValueOnce({
      page: livePage({ liveRelease: movedLive, latestVersion: 14 }),
      draft: {
        slug: 'uu-dai-thang-11',
        composition: { version: 1, sections: [] },
        seo: { title: '', description: '', shareImageAssetId: null, noindex: false },
        revision: 5,
        updatedAt: '2026-10-24T08:00:00.000Z',
        updatedBy: { id: '64b000000000000000000004', name: 'Ngọc Anh' },
      },
      checks: checks(),
    });
    await user.click(publishButton());

    expect(await screen.findByText('Trang vừa thay đổi trong lúc xuất bản')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(endpoints.getPage, [PAGE_ID]);
    expect(props.ensureSaved).toHaveBeenCalledTimes(2);
    expect(publishButton()).toHaveTextContent('Xuất bản v15');

    const first = lastCallTo(apiMock, endpoints.publish).options as { headers: object };
    apiMock.mockResolvedValueOnce(publishResponse());
    await user.click(publishButton());
    await screen.findByRole('heading', { name: 'v13 đã live' });
    const second = lastCallTo(apiMock, endpoints.publish).options as {
      headers: object;
      body: { expectedPublishedReleaseId: string };
    };
    expect(second.headers).toEqual(first.headers);
    expect(second.body.expectedPublishedReleaseId).toBe(movedLive.id);
  });

  it('refreshes the checks from a blocked publish', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' });

    apiMock.mockRejectedValueOnce(
      new ApiError(422, {
        type: 'about:blank',
        title: 'Chưa thể xuất bản',
        status: 422,
        code: 'publish_blocked',
        context: { checks: checks({ warnings: [sampleWarning] }) },
      }),
    );
    await user.click(publishButton());

    expect(await screen.findByText('Kết quả kiểm tra đã thay đổi')).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo · Câu hỏi thường gặp còn nội dung mẫu')).toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
  });

  it('shows an unexpected failure and keeps the dialog open', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderDialog();
    await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' });

    apiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.click(publishButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    expect(publishButton()).toBeEnabled();
  });
});
