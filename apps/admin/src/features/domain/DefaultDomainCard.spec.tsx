import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { siteFixture } from '../dashboard/test-fixtures';
import { renderWithProviders } from '../shell/test-utils';
import { DefaultDomainCard } from './DefaultDomainCard';

describe('DefaultDomainCard', () => {
  it('shows the default domain as always working, without custom domains', () => {
    renderWithProviders(<DefaultDomainCard site={siteFixture()} />);

    const card = screen.getByRole('region', { name: 'Tên miền đang dùng' });
    expect(card).toHaveTextContent('smilecare.payload.site');
    expect(card).toHaveTextContent('MẶC ĐỊNH · MIỄN PHÍ');
    expect(card).toHaveTextContent('Luôn hoạt động');
    expect(card).toHaveTextContent(
      'Có sẵn khi tạo site, dùng được ngay cả khi chưa có tên miền riêng.',
    );
    expect(screen.getByText('Kết nối tên miền riêng sẽ có ở phiên bản sau.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm tên miền/ })).not.toBeInTheDocument();
  });

  it('copies the address and confirms it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderWithProviders(<DefaultDomainCard site={siteFixture()} />);

    await user.click(
      screen.getByRole('button', { name: 'Sao chép địa chỉ smilecare.payload.site' }),
    );

    expect(writeText).toHaveBeenCalledWith('https://smilecare.payload.site');
    expect(await screen.findByText('Đã sao chép')).toBeInTheDocument();
  });

  it('explains when the browser refuses to copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    renderWithProviders(<DefaultDomainCard site={siteFixture()} />);

    await user.click(
      screen.getByRole('button', { name: 'Sao chép địa chỉ smilecare.payload.site' }),
    );

    expect(await screen.findByText('Chưa sao chép được')).toBeInTheDocument();
  });
});
