import {
  type CheckItem,
  type ChecksResult,
  endpoints,
  type PageApproval,
  type PageSummary,
  type PublishResponse,
  type Access,
  type SaveDraftResponse,
} from '@plp/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../lib/api';
import { pageDetail, pageSummary, site, SITE_ID, PAGE_ID } from '../editor/test-fixtures';
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
const OWNER_ID = '64b000000000000000000004';
const CONTRIBUTOR = { id: '64b0000000000000000000c1', name: 'Minh' };

/** Minh's request to publish revision 5, the draft the dialog reviews (ADR-023). */
function waiting(overrides: Partial<Extract<PageApproval, { status: 'pending' }>> = {}) {
  return {
    status: 'pending' as const,
    id: '64b0000000000000000000a1',
    requestedBy: CONTRIBUTOR,
    revision: 5,
    note: 'Đổi giá ưu đãi',
    sentAt: '2026-10-24T07:50:00.000Z',
    ...overrides,
  };
}

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
      capturesLeads: false,
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
  /** The page as the server has it, when the editor holds an older summary. */
  serverPage?: PageSummary;
  result?: ChecksResult;
  role?: Access;
  userId?: string;
}

function renderDialog({
  page = livePage(),
  serverPage = page,
  result = checks(),
  role = 'owner',
  userId = OWNER_ID,
}: Setup = {}) {
  const props = {
    onOpenChange: vi.fn(),
    ensureSaved: vi.fn(() => Promise.resolve(saved(page))),
    onFixTarget: vi.fn(),
    onPageUpdated: vi.fn(),
    role,
    userId,
  };
  // The dialog reads the page as the server has it now (ADR-023).
  apiMock.mockImplementation((endpoint) =>
    endpoint === endpoints.getPage
      ? Promise.resolve({
          page: serverPage,
          draft: { ...pageDetail().draft, revision: 5 },
          checks: result,
        })
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
    expect(apiMock).toHaveBeenCalledWith(endpoints.getPage, [SITE_ID, PAGE_ID]);
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

    // The publish names the chips it showed, so the server refuses a look nobody saw.
    apiMock.mockResolvedValueOnce(publishResponse());
    await userEvent.setup().click(publishButton());
    await screen.findByRole('heading', { name: 'v13 đã live' });
    const { options } = lastCallTo(apiMock, endpoints.publish) as {
      options: { body: { acknowledgedSiteChanges: string[] } };
    };
    expect(options.body.acknowledgedSiteChanges).toEqual([
      'Giao diện site: giao diện',
      'Giao diện site: logo',
    ]);
  });

  it('reloads the page and checks when the site settings changed during the publish', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' });
    apiMock.mockRejectedValueOnce(
      new ApiError(409, {
        type: 'about:blank',
        title: 'Cài đặt site vừa thay đổi',
        status: 409,
        code: 'site_changed',
      }),
    );
    apiMock.mockResolvedValueOnce({
      page: livePage({
        siteChanges: [{ kind: 'site', label: 'Giao diện site: giao diện', sectionId: null }],
      }),
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
    expect(apiMock).toHaveBeenCalledWith(endpoints.getPage, [SITE_ID, PAGE_ID]);
    expect(
      within(screen.getByRole('list', { name: 'Các thay đổi' })).getByText(
        'Giao diện site: giao diện',
      ),
    ).toBeInTheDocument();
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

  describe('a form missing site settings only Chủ sở hữu and Quản trị may change', () => {
    const consentMissing: CheckItem = {
      code: 'consent_not_configured',
      severity: 'blocking',
      fingerprint: 'consent_not_configured:form00000001',
      title: 'Form chưa có nội dung đồng ý',
      description: 'Cài đặt dữ liệu cá nhân và nội dung đồng ý của site.',
      target: { kind: 'privacy', sectionId: 'form00000001' },
    };
    const destinationMissing: CheckItem = {
      code: 'lead_destination_missing',
      severity: 'blocking',
      fingerprint: 'lead_destination_missing:form00000001',
      title: 'Chưa chọn nơi nhận lead',
      description: 'Thêm và xác nhận một email nhận lead.',
      target: { kind: 'lead_recipients', sectionId: 'form00000001' },
    };

    it('tells a Biên tập whom to ask instead of opening screens they cannot use', async () => {
      const result = checks({ blocking: [consentMissing, destinationMissing, blockingItem] });
      const props = renderDialog({ result, role: 'editor' });

      const consent = (await screen.findByText(/Form chưa có nội dung đồng ý/)).closest('li');
      const destination = screen.getByText(/Chưa chọn nơi nhận lead/).closest('li');
      if (consent === null || destination === null) {
        throw new Error('check rows missing');
      }
      expect(within(consent).queryByRole('button')).toBeNull();
      expect(consent).toHaveTextContent(
        'Chỉ Chủ sở hữu và Quản trị cài đặt được dữ liệu cá nhân và nội dung đồng ý. Hãy nhờ họ làm bước này, rồi xuất bản lại.',
      );
      expect(within(destination).queryByRole('button')).toBeNull();
      expect(destination).toHaveTextContent(
        'Chỉ Chủ sở hữu và Quản trị chọn được nơi nhận lead. Hãy nhờ họ thêm và xác nhận một email, rồi xuất bản lại.',
      );
      // What the Biên tập can fix keeps its button.
      expect(screen.getAllByRole('button', { name: 'Sửa ngay' })).toHaveLength(1);
      expect(props.onFixTarget).not.toHaveBeenCalled();
    });

    it('takes Chủ sở hữu to the setting', async () => {
      const user = userEvent.setup();
      const result = checks({ blocking: [consentMissing, destinationMissing] });
      const props = renderDialog({ result, role: 'owner' });

      const buttons = await screen.findAllByRole('button', { name: 'Sửa ngay' });
      expect(buttons).toHaveLength(2);
      expect(screen.queryByText(/Hãy nhờ họ/)).toBeNull();
      const [consentFix, destinationFix] = buttons;
      if (consentFix === undefined || destinationFix === undefined) {
        throw new Error('fix buttons missing');
      }
      await user.click(destinationFix);
      expect(props.onFixTarget).toHaveBeenCalledWith(destinationMissing.target);
    });
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
    expect(args).toEqual([SITE_ID, PAGE_ID]);
    expect(options).toEqual({
      body: {
        expectedRevision: 5,
        expectedPublishedReleaseId: LIVE_RELEASE.id,
        acknowledgedWarnings: [altWarning.fingerprint],
        acknowledgedSiteChanges: [],
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
    // The member's own visit is not counted; the QR code keeps the address to share.
    expect(screen.getByRole('link', { name: /Mở trang live/ })).toHaveAttribute(
      'href',
      `${LIVE_URL}?plp_internal=1`,
    );
    expect(
      screen.queryByText('Trang live có thể mất tới 5 phút để cập nhật.'),
    ).not.toBeInTheDocument();
    expect(props.onPageUpdated).toHaveBeenLastCalledWith(response.page, expect.anything());

    await user.click(screen.getByRole('button', { name: 'Tiếp tục chỉnh sửa' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('offers no restore to a role that publishes but does not roll back (ADR-024)', async () => {
    const user = userEvent.setup();
    renderDialog({
      role: {
        customRoleId: '64b0000000000000000000c1',
        name: 'Người đăng bài',
        permissions: ['pages.view', 'pages.edit', 'pages.publish'],
      },
    });
    await screen.findByRole('heading', { name: 'Xuất bản 2 thay đổi' });
    apiMock.mockResolvedValueOnce(publishResponse());
    await user.click(publishButton());

    expect(await screen.findByRole('heading', { name: 'v13 đã live' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Khôi phục/ })).not.toBeInTheDocument();
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
    expect(apiMock).toHaveBeenCalledWith(endpoints.getPage, [SITE_ID, PAGE_ID]);
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

describe('PublishDialog · requests to publish (ADR-023)', () => {
  it('lets a Cộng tác viên send the draft, leaving warnings to the approver', async () => {
    const user = userEvent.setup();
    const props = renderDialog({
      role: 'contributor',
      userId: CONTRIBUTOR.id,
      result: checks({ warnings: [altWarning] }),
    });

    expect(
      await screen.findByRole('heading', { name: 'Gửi yêu cầu xuất bản' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bỏ qua lần này' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Chỉ Chủ sở hữu và Quản trị duyệt được. Trang live giữ nguyên tới khi được duyệt.',
      ),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Ghi chú cho người duyệt/), 'Đổi giá');

    const sent = livePage({ approval: waiting({ note: 'Đổi giá' }) });
    apiMock.mockResolvedValueOnce({ page: sent });
    await user.click(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' }));

    expect(
      await screen.findByRole('heading', { name: 'Đã gửi yêu cầu duyệt' }),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(endpoints.requestApproval, [SITE_ID, PAGE_ID], {
      body: {
        expectedRevision: 5,
        expectedPublishedReleaseId: LIVE_RELEASE.id,
        approvalId: null,
        note: 'Đổi giá',
      },
    });
    expect(props.onPageUpdated).toHaveBeenCalledWith(sent, expect.anything());
  });

  it('refuses to send a draft with a blocking error', async () => {
    renderDialog({
      role: 'contributor',
      userId: CONTRIBUTOR.id,
      result: checks({ blocking: [blockingItem] }),
    });
    expect(await screen.findByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeDisabled();
    expect(screen.getByText('Sửa 1 lỗi để gửi yêu cầu')).toBeInTheDocument();
  });

  it('shows the sender’s own waiting request: send again or withdraw it', async () => {
    const user = userEvent.setup();
    const props = renderDialog({
      role: 'contributor',
      userId: CONTRIBUTOR.id,
      page: livePage({ approval: waiting({ revision: 4 }) }),
    });

    expect(await screen.findByRole('button', { name: 'Gửi lại yêu cầu' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Rút yêu cầu' })).toBeEnabled();
    expect(screen.getByLabelText(/Ghi chú cho người duyệt/)).toHaveValue('Đổi giá ưu đãi');
    expect(
      screen.getByText('Bản nháp có thay đổi sau khi gửi. Gửi lại để người duyệt biết có bản mới.'),
    ).toBeInTheDocument();

    const withdrawn = livePage({ approval: null });
    apiMock.mockResolvedValueOnce({ page: withdrawn });
    await user.click(screen.getByRole('button', { name: 'Rút yêu cầu' }));
    expect(await screen.findByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(endpoints.withdrawApproval, [SITE_ID, PAGE_ID]);
    expect(props.onPageUpdated).toHaveBeenCalledWith(withdrawn);
  });

  it('waits for someone else’s request instead of sending another', async () => {
    renderDialog({
      role: 'contributor',
      userId: '64b0000000000000000000c2',
      page: livePage({ approval: waiting() }),
    });
    expect(await screen.findByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeDisabled();
    expect(screen.getByText('Đang chờ duyệt yêu cầu của Minh')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rút yêu cầu' })).not.toBeInTheDocument();
  });

  it('lets Chủ sở hữu approve by publishing, or refuse with a reason', async () => {
    const user = userEvent.setup();
    const props = renderDialog({ page: livePage({ approval: waiting() }) });

    expect(
      await screen.findByRole('button', { name: 'Duyệt và xuất bản v13' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Minh gửi yêu cầu xuất bản · /)).toBeInTheDocument();
    expect(screen.getByText('“Đổi giá ưu đãi”')).toBeInTheDocument();
    // The request's note is the first suggestion for the version note.
    expect(screen.getByLabelText(/Ghi chú cho phiên bản/)).toHaveValue('Đổi giá ưu đãi');

    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(
      await screen.findByRole('heading', { name: 'Từ chối yêu cầu của Minh' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(screen.getByText('Nhập lý do để người gửi biết cần sửa gì')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith(
      endpoints.rejectApproval,
      expect.anything(),
      expect.anything(),
    );

    const refused = livePage({ approval: null });
    apiMock.mockResolvedValueOnce({ page: refused });
    await user.type(screen.getByLabelText(/Lý do/), 'Giá chưa đúng');
    await user.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));
    expect(apiMock).toHaveBeenCalledWith(endpoints.rejectApproval, [SITE_ID, PAGE_ID], {
      body: { approvalId: '64b0000000000000000000a1', revision: 5, reason: 'Giá chưa đúng' },
    });
    expect(props.onPageUpdated).toHaveBeenCalledWith(refused);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('tells a Biên tập that publishing answers the request, without refusing it', async () => {
    renderDialog({ role: 'editor', page: livePage({ approval: waiting({ revision: 4 }) }) });
    expect(await screen.findByRole('button', { name: 'Xuất bản v13' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
    expect(screen.getByText('Xuất bản trang cũng trả lời yêu cầu này.')).toBeInTheDocument();
    expect(
      screen.getByText('Bản nháp đã thay đổi sau khi gửi yêu cầu. Bạn đang xem bản nháp hiện tại.'),
    ).toBeInTheDocument();
  });

  it('shows why the last request was refused', async () => {
    renderDialog({
      role: 'contributor',
      userId: CONTRIBUTOR.id,
      page: livePage({
        approval: {
          ...waiting(),
          status: 'rejected',
          rejectedBy: { id: OWNER_ID, name: 'Ngọc Anh' },
          rejectedAt: '2026-10-24T07:55:00.000Z',
          reason: 'Giá chưa đúng',
        },
      }),
    });
    expect(await screen.findByText(/^Ngọc Anh chưa duyệt yêu cầu · /)).toBeInTheDocument();
    expect(screen.getByText('Lý do: Giá chưa đúng')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeEnabled();
  });
});

describe('PublishDialog · a request answered under the dialog (ADR-023)', () => {
  it('shows the request the server has now, not the one the editor loaded', async () => {
    // The editor still holds a waiting request; the server says it was published since.
    renderDialog({
      role: 'contributor',
      userId: CONTRIBUTOR.id,
      page: livePage({ approval: waiting() }),
      serverPage: livePage({ approval: null }),
    });
    expect(await screen.findByRole('button', { name: 'Gửi yêu cầu duyệt' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Rút yêu cầu' })).not.toBeInTheDocument();
  });

  it('sends the request it shows again, and reloads when it was answered meanwhile', async () => {
    const user = userEvent.setup();
    renderDialog({
      role: 'contributor',
      userId: CONTRIBUTOR.id,
      page: livePage({ approval: waiting() }),
    });
    await screen.findByRole('button', { name: 'Gửi lại yêu cầu' });
    apiMock.mockRejectedValueOnce(
      new ApiError(409, {
        type: 'about:blank',
        title: 'Yêu cầu xuất bản vừa thay đổi',
        status: 409,
        code: 'approval_changed',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Gửi lại yêu cầu' }));
    expect(lastCallTo(apiMock, endpoints.requestApproval).options).toMatchObject({
      body: { approvalId: '64b0000000000000000000a1' },
    });
    expect(await screen.findByText('Yêu cầu xuất bản vừa thay đổi')).toBeInTheDocument();
  });

  it('announces a missing reason for a refusal', async () => {
    const user = userEvent.setup();
    renderDialog({ page: livePage({ approval: waiting() }) });
    await user.click(await screen.findByRole('button', { name: 'Từ chối' }));
    await user.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));
    const error = screen.getByText('Nhập lý do để người gửi biết cần sửa gì');
    expect(error.closest('[aria-live]')).not.toBeNull();
  });
});
