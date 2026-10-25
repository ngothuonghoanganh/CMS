import { type Asset, endpoints } from '@plp/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { SITE_ID, siteFixture } from '../dashboard/test-fixtures';
import { apiError, renderWithProviders } from '../shell/test-utils';
import { settingsChanges, settingsValuesOf } from './site-settings';
import { SiteSettingsForm } from './SiteSettingsForm';

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock(import('../../lib/api'), async (importOriginal) => ({
  ...(await importOriginal()),
  api: vi.fn(),
}));

const apiMock = vi.mocked(api);

const logo: Asset = {
  id: '64b0000000000000000000a7',
  siteId: SITE_ID,
  url: 'https://cdn.example.com/public/logo.png',
  mimeType: 'image/png',
  bytes: 12_000,
  width: 400,
  height: 120,
  alt: 'Logo Smile Care',
  decorative: false,
  uploadedBy: { id: '64b0000000000000000000c1', name: 'Ngọc Anh' },
  createdAt: '2026-10-02T08:00:00.000Z',
};

function nameInput(): HTMLElement {
  return screen.getByRole('textbox', { name: /Tên site/ });
}

beforeEach(() => {
  apiMock.mockReset();
  router.refresh.mockReset();
});

describe('settingsChanges', () => {
  it('lists only what differs from the saved site', () => {
    const site = siteFixture({ logoAssetId: logo.id });
    const values = settingsValuesOf(site, [logo]);
    const untouched = { logo: false, shareImage: false };
    expect(settingsChanges(site, values, untouched)).toEqual({});
    expect(
      settingsChanges(
        site,
        { ...values, name: ' Smile Care ', themePresetId: 'indigo' },
        untouched,
      ),
    ).toEqual({ name: 'Smile Care', themePresetId: 'indigo' });
    expect(settingsChanges(site, { ...values, logo: null }, { ...untouched, logo: true })).toEqual({
      logoAssetId: null,
    });
  });

  it('keeps an image that could not be loaded until the user changes it', () => {
    const site = siteFixture({ logoAssetId: logo.id });
    const values = settingsValuesOf(site, []);
    expect(values.logo).toBeNull();
    expect(settingsChanges(site, values, { logo: false, shareImage: false })).toEqual({});
  });
});

describe('SiteSettingsForm', () => {
  it('saves only the changed settings and refreshes the layout', async () => {
    const user = userEvent.setup();
    const site = siteFixture();
    apiMock.mockResolvedValueOnce({ ...site, name: 'Smile Care Quận 3', themePresetId: 'indigo' });
    renderWithProviders(<SiteSettingsForm site={site} assets={[]} canEdit />);

    const save = screen.getByRole('button', { name: 'Lưu cài đặt' });
    expect(save).toBeDisabled();

    await user.clear(nameInput());
    await user.type(nameInput(), 'Smile Care Quận 3');
    await user.click(screen.getByRole('radio', { name: 'Chàm' }));
    expect(save).toBeEnabled();
    await user.click(save);

    expect(await screen.findByText('Đã lưu cài đặt site')).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(endpoints.updateSite, [SITE_ID], {
      body: { name: 'Smile Care Quận 3', themePresetId: 'indigo' },
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    // Saving is not publishing: live pages keep the look they were published with (ADR-015).
    expect(
      screen.getByText(
        'Các trang đang live vẫn giữ giao diện cũ cho tới khi bạn xuất bản lại từng trang.',
      ),
    ).toBeInTheDocument();
    // The note belongs to that save; the next edit starts over.
    await user.type(nameInput(), ' mới');
    expect(screen.queryByText(/vẫn giữ giao diện cũ/)).toBeNull();
  });

  it('checks the name before saving', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteSettingsForm site={siteFixture()} assets={[]} canEdit />);

    await user.clear(nameInput());
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    expect(screen.getByText('Nhập tên site')).toBeInTheDocument();
    expect(nameInput()).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('shows a refusal from the server', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      apiError(403, 'forbidden', 'Chỉ Owner của workspace được thay đổi cài đặt site'),
    );
    renderWithProviders(<SiteSettingsForm site={siteFixture()} assets={[]} canEdit />);

    await user.click(screen.getByRole('radio', { name: 'Hoàng hôn' }));
    await user.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chỉ Owner của workspace được thay đổi cài đặt site',
    );
  });

  it('resets unsaved changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SiteSettingsForm site={siteFixture()} assets={[]} canEdit />);

    await user.type(nameInput(), ' mới');
    await user.click(screen.getByRole('button', { name: 'Hủy thay đổi' }));
    expect(nameInput()).toHaveValue('Nha khoa Smile Care');
  });

  it('is read-only for editors', () => {
    renderWithProviders(
      <SiteSettingsForm
        site={siteFixture({ logoAssetId: logo.id })}
        assets={[logo]}
        canEdit={false}
      />,
    );

    expect(
      screen.getByText('Chỉ Owner của workspace được thay đổi cài đặt site.'),
    ).toBeInTheDocument();
    expect(nameInput()).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Bạc hà' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thay ảnh' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Lưu cài đặt' })).not.toBeInTheDocument();
  });
});
