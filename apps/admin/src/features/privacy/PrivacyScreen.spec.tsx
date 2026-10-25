import {
  type ConsentVersion,
  endpoints,
  type PrivacySettings,
  type SitePrivacy,
  SUGGESTED_MARKETING_CONSENT_TEXT,
  SUGGESTED_REQUIRED_CONSENT_TEXT,
} from '@plp/contracts';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID } from '../dashboard/test-fixtures';
import { apiError, lastCallTo, renderWithProviders } from '../shell/test-utils';
import { consentBadgeText, parseRetention, retentionValue } from './privacy-presentation';
import { PrivacyScreen } from './PrivacyScreen';

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const anh = { id: '64b0000000000000000000c1', name: 'Ngọc Anh' };

function consentVersion(version: number, overrides: Partial<ConsentVersion> = {}): ConsentVersion {
  return {
    id: `64b0000000000000000000e${version}`,
    version,
    requiredText: 'Tôi đồng ý để {Tên doanh nghiệp} xử lý họ tên và số điện thoại của tôi.',
    marketingText: 'Nhận ưu đãi qua Zalo',
    createdBy: anh,
    createdAt: '2026-10-01T03:00:00.000Z',
    ...overrides,
  };
}

const privacy: SitePrivacy = {
  controllerName: 'Công ty TNHH Nha khoa Smile Care',
  requestEmail: 'dulieu@smilecare.vn',
  policyUrl: 'https://smilecare.vn/chinh-sach',
  retentionMonths: 12,
  updatedAt: '2026-10-01T03:00:00.000Z',
};

const configured: PrivacySettings = { privacy, currentConsent: consentVersion(2) };

const empty: PrivacySettings = { privacy: null, currentConsent: null };

function consentCard(): HTMLElement {
  return screen.getByRole('region', { name: 'Nội dung đồng ý trên form' });
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('privacy presentation', () => {
  it('maps retention periods to select values and back', () => {
    for (const months of [6, 12, 24, null] as const) {
      expect(parseRetention(retentionValue(months))).toBe(months);
    }
    expect(() => parseRetention('3')).toThrow();
  });

  it('labels the current consent version', () => {
    expect(consentBadgeText(null)).toBe('Chưa có nội dung đồng ý');
    expect(consentBadgeText(consentVersion(2))).toBe('Bản 2 · đang dùng từ 01/10/2026');
  });
});

describe('PrivacyScreen', () => {
  it('saves the settings and says live forms keep the old ones', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({
      ...configured,
      privacy: { ...privacy, retentionMonths: 24 },
    } satisfies PrivacySettings);
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={configured} canEdit />);

    await user.selectOptions(screen.getByRole('combobox', { name: /Tự động xóa lead/ }), '24');
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    expect(await screen.findByText('Đã lưu cài đặt dữ liệu cá nhân')).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.updatePrivacySettings)).toEqual({
      args: [SITE_ID],
      options: {
        body: {
          controllerName: 'Công ty TNHH Nha khoa Smile Care',
          requestEmail: 'dulieu@smilecare.vn',
          policyUrl: 'https://smilecare.vn/chinh-sach',
          retentionMonths: 24,
        },
      },
    });
    expect(screen.getByText(/Trang có form đang live giữ nội dung đồng ý/)).toBeInTheDocument();
  });

  it('keeps focus in the field when the save button is pressed, so its check cannot move the button', () => {
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={empty} canEdit />);
    // `fireEvent` returns false when the handler prevented the default (moving focus).
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Lưu cài đặt' }))).toBe(false);
  });

  it('checks the business name and the policy link before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={empty} canEdit />);

    await user.type(screen.getByRole('textbox', { name: /Link chính sách/ }), 'smilecare.vn');
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    expect(screen.getByText('Nhập tên doanh nghiệp')).toBeInTheDocument();
    expect(
      screen.getByText('Đường dẫn phải bắt đầu bằng http:// hoặc https://'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Tên doanh nghiệp/ })).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('suggests the design texts and previews them with the saved business name', () => {
    renderWithProviders(
      <PrivacyScreen siteId={SITE_ID} settings={{ privacy, currentConsent: null }} canEdit />,
    );
    const card = consentCard();
    expect(within(card).getByText('Chưa có nội dung đồng ý')).toBeInTheDocument();
    expect(within(card).getByRole('textbox', { name: /Đồng ý bắt buộc/ })).toHaveValue(
      SUGGESTED_REQUIRED_CONSENT_TEXT,
    );
    expect(within(card).getByRole('textbox', { name: 'Nội dung ô nhận ưu đãi' })).toHaveValue(
      SUGGESTED_MARKETING_CONSENT_TEXT,
    );
    const preview = within(card).getByRole('group', { name: 'Khách sẽ thấy' });
    expect(preview).toHaveTextContent(
      'Tôi đồng ý để Công ty TNHH Nha khoa Smile Care xử lý họ tên',
    );
    expect(preview).toHaveTextContent('Chính sách quyền riêng tư');
    expect(within(card).getByRole('button', { name: 'Lưu thành bản 1' })).toBeEnabled();
  });

  it('saves an edited text as the next version', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(consentVersion(3, { marketingText: null }));
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={configured} canEdit />);
    const card = consentCard();
    const save = within(card).getByRole('button', { name: 'Lưu thành bản 3' });
    // Nothing differs from Bản 2 yet.
    expect(save).toBeDisabled();

    await user.click(within(card).getByRole('switch', { name: /Thêm ô đồng ý nhận ưu đãi/ }));
    expect(within(card).queryByRole('textbox', { name: 'Nội dung ô nhận ưu đãi' })).toBeNull();
    await user.click(save);

    expect(await screen.findByText('Đã lưu nội dung đồng ý bản 3')).toBeInTheDocument();
    expect(lastCallTo(apiMock, endpoints.createConsentVersion)).toEqual({
      args: [SITE_ID],
      options: {
        body: {
          baseVersion: 2,
          requiredText: configured.currentConsent?.requiredText,
          marketingText: null,
        },
      },
    });
    expect(within(card).getByText('Bản 3 · đang dùng từ 01/10/2026')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Lưu thành bản 4' })).toBeDisabled();
  });

  it('offers the latest version when someone saved one in the meantime', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(409, 'conflict', 'Nội dung đồng ý vừa được lưu thành bản mới'),
    );
    const latest = consentVersion(3, { requiredText: 'Bản của người khác.' });
    apiMock.mockResolvedValueOnce({ ...configured, currentConsent: latest });
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={configured} canEdit />);
    const card = consentCard();

    await user.type(within(card).getByRole('textbox', { name: /Đồng ý bắt buộc/ }), ' Thêm.');
    await user.click(within(card).getByRole('button', { name: 'Lưu thành bản 3' }));
    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent('Nội dung đồng ý vừa được lưu thành bản mới');

    await user.click(within(alert).getByRole('button', { name: 'Tải bản mới nhất' }));
    expect(await within(card).findByText('Bản 3 · đang dùng từ 01/10/2026')).toBeInTheDocument();
    expect(within(card).getByRole('textbox', { name: /Đồng ý bắt buộc/ })).toHaveValue(
      'Bản của người khác.',
    );
  });

  it('shows editors the settings read-only', () => {
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={configured} canEdit={false} />);
    expect(
      screen.getByText('Chỉ Owner của workspace được thay đổi dữ liệu cá nhân và đồng ý.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Tên doanh nghiệp/ })).toBeDisabled();
    expect(within(consentCard()).getByRole('textbox', { name: /Đồng ý bắt buộc/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu cài đặt' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lưu thành bản/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Xem các bản đã lưu' })).toBeInTheDocument();
  });

  it('lists the saved versions newest first', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({
      items: [consentVersion(2), consentVersion(1, { marketingText: null })],
      nextCursor: null,
    });
    renderWithProviders(<PrivacyScreen siteId={SITE_ID} settings={configured} canEdit />);

    await user.click(screen.getByRole('button', { name: 'Xem các bản đã lưu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Các bản nội dung đồng ý' });
    const items = await within(dialog).findAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Bản 2 · 01/10/2026 10:00 · Ngọc Anh',
      'Bản 1 · 01/10/2026 10:00 · Ngọc Anh',
    ]);
    expect(items[1]).toHaveTextContent('Không có ô nhận ưu đãi');
  });
});
